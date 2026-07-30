/**
 * Self-settle verify + broadcast for any Token Pay merchant (Edge-safe, fetch RPC only).
 * No @solana/web3.js — Edge runtime blocks Node http/https from that package.
 */
import { solanaRpcParallelRace } from "../x402-solana-rpc";
import { assertTokenPaySelfSettleAuthorized } from "./security";
import { scheduleTokenPaySettlementRecord } from "./analytics-store";
import { effectiveUsdcForTokenPay } from "./x402";
import { priceUsdcForResource, type X402ResourceKind } from "../x402-pricing";
import { getTokenPaySettleReceipt, putTokenPaySettleReceipt } from "./settle-receipt-cache";
import type { TokenPayPaymentPayload, TokenPaySelfSettleRequirement } from "./types";

export { isTokenPaySelfSettleRequirement } from "./security";

const SIM_RPC_MS = 2_500;
const SEND_RPC_MS = 3_500;
/** Short polls so Edge settle stays inside the Concierge budget. */
const POLL_RPC_MS = 1_200;
const POLL_INTERVAL_MS = 200;
const VERIFY_BUDGET_MS = 10_000;
const TX_DETAIL_RPC_MS = 2_000;
const TX_DETAIL_RETRIES = 3;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

type TokenBalanceRow = {
  owner?: string;
  mint?: string;
  uiTokenAmount?: { amount?: string };
};

type GetTxDetail = {
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string }>;
    };
  };
  meta?: {
    err?: unknown;
    preTokenBalances?: TokenBalanceRow[];
    postTokenBalances?: TokenBalanceRow[];
  };
};

type SignatureStatusResult = {
  value?: { confirmationStatus?: string; err?: unknown }[];
};

function tokenSymbolFromExtra(extra?: Record<string, unknown>): string {
  const name = extra?.name;
  return typeof name === "string" && name ? name : "token";
}

function tokenPayError(symbol: string, message: string): Error {
  return new Error(`${symbol} payment: ${message}`);
}

function friendlyRpcError(raw: string): string {
  if (/aborted|timeout|timed out|network|fetch failed/i.test(raw)) {
    return "Solana RPC timed out — retry in a few seconds";
  }
  if (raw.startsWith("RPC HTTP") || /method not found/i.test(raw)) {
    return "Solana RPC misconfigured — set SOLANA_RPC_URL to https://mainnet.helius-rpc.com/?api-key=KEY or remove it for publicnode fallback";
  }
  return raw || "failed to broadcast transaction";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const input = Array.from(bytes);
  const encoded: number[] = [];
  let startAt = zeros;
  while (startAt < input.length) {
    let carry = 0;
    for (let i = startAt; i < input.length; i++) {
      const n = input[i] + carry * 256;
      input[i] = Math.floor(n / 58);
      carry = n % 58;
    }
    encoded.push(carry);
    while (startAt < input.length && input[startAt] === 0) startAt++;
  }
  let str = "";
  for (let i = 0; i < zeros; i++) str += "1";
  for (let i = encoded.length - 1; i >= 0; i--) str += BASE58_ALPHABET[encoded[i]!];
  return str;
}

function readCompactU16(wire: Uint8Array, start: number): { value: number; next: number } | null {
  let value = 0;
  let size = 0;
  let offset = start;
  while (size < 4) {
    if (offset >= wire.length) return null;
    const byte = wire[offset++]!;
    value |= (byte & 0x7f) << (size * 7);
    size++;
    if ((byte & 0x80) === 0) return { value, next: offset };
  }
  return null;
}

function decodeSignedTxWire(txB64: string): { signature: string | null; feePayer: string | null } {
  try {
    const wire = Uint8Array.from(atob(txB64), (c) => c.charCodeAt(0));
    const sigHeader = readCompactU16(wire, 0);
    if (!sigHeader || sigHeader.value < 1) return { signature: null, feePayer: null };
    const sigStart = sigHeader.next;
    if (wire.length < sigStart + 64) return { signature: null, feePayer: null };
    const signature = base58Encode(wire.slice(sigStart, sigStart + 64));

    let offset = sigStart + sigHeader.value * 64;
    if (offset >= wire.length) return { signature, feePayer: null };

    if (wire[offset] === 0x80) {
      offset += 1 + 3;
      const keysHeader = readCompactU16(wire, offset);
      if (!keysHeader || keysHeader.value < 1) return { signature, feePayer: null };
      const keyStart = keysHeader.next;
      if (wire.length < keyStart + 32) return { signature, feePayer: null };
      return { signature, feePayer: base58Encode(wire.slice(keyStart, keyStart + 32)) };
    }

    offset += 1 + 3;
    const keysHeader = readCompactU16(wire, offset);
    if (!keysHeader || keysHeader.value < 1) return { signature, feePayer: null };
    const keyStart = keysHeader.next;
    if (wire.length < keyStart + 32) return { signature, feePayer: null };
    return { signature, feePayer: base58Encode(wire.slice(keyStart, keyStart + 32)) };
  } catch {
    return { signature: null, feePayer: null };
  }
}

function feePayerFromTxDetail(tx: GetTxDetail): string | null {
  const keys = tx.transaction?.message?.accountKeys;
  if (!keys?.length) return null;
  const first = keys[0];
  if (typeof first === "string") return first;
  return first.pubkey ?? null;
}

function merchantMintDelta(
  pre: TokenBalanceRow[] | undefined,
  post: TokenBalanceRow[] | undefined,
  merchant: string,
  mint: string,
): bigint {
  let preAmt = 0n;
  let postAmt = 0n;
  for (const row of pre ?? []) {
    if (row.owner === merchant && row.mint === mint) {
      preAmt = BigInt(row.uiTokenAmount?.amount ?? "0");
    }
  }
  for (const row of post ?? []) {
    if (row.owner === merchant && row.mint === mint) {
      postAmt = BigInt(row.uiTokenAmount?.amount ?? "0");
    }
  }
  return postAmt - preAmt;
}

function merchantIdFromMatched(
  matched: TokenPaySelfSettleRequirement,
  merchant: Awaited<ReturnType<typeof assertTokenPaySelfSettleAuthorized>>,
): string {
  return typeof matched.extra?.merchantId === "string"
    ? matched.extra.merchantId.trim()
    : merchant.id;
}

function receiptMatchesRequirement(
  receipt: Awaited<ReturnType<typeof getTokenPaySettleReceipt>>,
  matched: TokenPaySelfSettleRequirement,
  resourceKind: string,
  merchantId: string,
): boolean {
  if (!receipt) return false;
  if (receipt.resourceKind !== resourceKind) return false;
  if (receipt.merchantId !== merchantId) return false;
  if (receipt.mint !== matched.asset) return false;
  const paid = BigInt(receipt.amountAtomic);
  const required = BigInt(matched.amount);
  return paid >= required;
}

async function fetchConfirmedTransactionOnce(signature: string): Promise<GetTxDetail | null> {
  const opts = {
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 1,
    commitment: "confirmed",
  };
  const tx = await solanaRpcParallelRace<GetTxDetail | null>(
    "getTransaction",
    [signature, opts],
    TX_DETAIL_RPC_MS,
  );
  return tx.ok && tx.result ? tx.result : null;
}

async function fetchConfirmedTransactionWithRetry(signature: string): Promise<GetTxDetail | null> {
  for (let i = 0; i < TX_DETAIL_RETRIES; i++) {
    const tx = await fetchConfirmedTransactionOnce(signature);
    if (tx) return tx;
    if (i < TX_DETAIL_RETRIES - 1) await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function waitForSignatureConfirmed(signature: string): Promise<boolean> {
  const deadline = Date.now() + VERIFY_BUDGET_MS;
  while (Date.now() < deadline) {
    if (await signatureLooksConfirmed(signature)) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function signatureLooksConfirmed(signature: string): Promise<boolean> {
  const status = await solanaRpcParallelRace<SignatureStatusResult>(
    "getSignatureStatuses",
    [[signature], { searchTransactionHistory: true }],
    POLL_RPC_MS,
  );
  const entry = status.ok ? status.result.value?.[0] : null;
  if (entry?.err) return false;
  return (
    entry?.confirmationStatus === "confirmed" ||
    entry?.confirmationStatus === "finalized" ||
    entry?.confirmationStatus === "processed"
  );
}

function usdcMicroForResourceKind(resourceKind: string, merchant: { id: string }): {
  listUsdcMicro: number;
  effectiveUsdcMicro: number;
} {
  const list = priceUsdcForResource(resourceKind as X402ResourceKind);
  const effective = effectiveUsdcForTokenPay(list, merchant as Parameters<typeof effectiveUsdcForTokenPay>[1]);
  return {
    listUsdcMicro: Math.round(list * 1_000_000),
    effectiveUsdcMicro: Math.round(effective * 1_000_000),
  };
}

function finalizeSettlement(input: {
  signature: string;
  payer: string;
  matched: TokenPaySelfSettleRequirement;
  resourceKind: string;
  merchantId: string;
  merchant: Awaited<ReturnType<typeof assertTokenPaySelfSettleAuthorized>>;
}): { payer: string; transaction: string; network: string } {
  const revenue = usdcMicroForResourceKind(input.resourceKind, input.merchant);
  scheduleTokenPaySettlementRecord({
    merchantId: input.merchantId,
    mint: input.matched.asset,
    amountAtomic: input.matched.amount,
    resourceKind: input.resourceKind,
    payer: input.payer,
    tx: input.signature,
    listUsdcMicro: revenue.listUsdcMicro,
    effectiveUsdcMicro: revenue.effectiveUsdcMicro,
  });
  void putTokenPaySettleReceipt({
    signature: input.signature,
    payer: input.payer,
    network: input.matched.network,
    merchantId: input.merchantId,
    mint: input.matched.asset,
    amountAtomic: input.matched.amount,
    resourceKind: input.resourceKind,
    at: Date.now(),
  });
  return {
    payer: input.payer,
    transaction: input.signature,
    network: input.matched.network,
  };
}

function merchantReceivedRequiredAmount(
  tx: GetTxDetail,
  matched: TokenPaySelfSettleRequirement,
): boolean {
  const delta = merchantMintDelta(
    tx.meta?.preTokenBalances,
    tx.meta?.postTokenBalances,
    matched.payTo,
    matched.asset,
  );
  return delta >= BigInt(matched.amount);
}

async function tryAcceptCachedOrConfirmed(
  signature: string,
  matched: TokenPaySelfSettleRequirement,
  resourceKind: string,
  merchant: Awaited<ReturnType<typeof assertTokenPaySelfSettleAuthorized>>,
  payerFallback: string | null,
): Promise<{ payer: string; transaction: string; network: string } | null> {
  const merchantId = merchantIdFromMatched(matched, merchant);
  const cached = await getTokenPaySettleReceipt(signature);
  if (receiptMatchesRequirement(cached, matched, resourceKind, merchantId) && cached) {
    return {
      payer: cached.payer,
      transaction: cached.signature,
      network: cached.network,
    };
  }

  if (!(await signatureLooksConfirmed(signature))) return null;

  const tx = await fetchConfirmedTransactionOnce(signature);
  if (tx?.meta?.err) return null;
  // Confirmed on-chain is enough to reject phantom (status:null) settlements.
  // Prefer amount check when RPC returns token balances; allow lag otherwise.
  if (tx && !merchantReceivedRequiredAmount(tx, matched)) {
    const delta = merchantMintDelta(
      tx.meta?.preTokenBalances,
      tx.meta?.postTokenBalances,
      matched.payTo,
      matched.asset,
    );
    // Only reject when we clearly see an underpayment (balances present but short).
    if (delta > 0n) return null;
  }

  const payer = (tx ? feePayerFromTxDetail(tx) : null) ?? payerFallback;
  if (!payer) return null;

  return finalizeSettlement({
    signature,
    payer,
    matched,
    resourceKind,
    merchantId,
    merchant,
  });
}

export async function verifyAndSettleTokenPaySelf(
  paymentPayload: TokenPayPaymentPayload,
  matched: TokenPaySelfSettleRequirement,
  resourceKind: string,
): Promise<{ payer: string; transaction: string; network: string }> {
  const merchant = assertTokenPaySelfSettleAuthorized(matched, resourceKind);
  const symbol = merchant.symbol || tokenSymbolFromExtra(matched.extra);
  try {
    return await verifyAndSettleTokenPaySelfInner(
      paymentPayload,
      matched,
      resourceKind,
      merchant,
      symbol,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (new RegExp(`${symbol} payment:`, "i").test(msg)) throw e;
    throw tokenPayError(symbol, friendlyRpcError(msg));
  }
}

async function verifyAndSettleTokenPaySelfInner(
  paymentPayload: TokenPayPaymentPayload,
  matched: TokenPaySelfSettleRequirement,
  resourceKind: string,
  merchant: Awaited<ReturnType<typeof assertTokenPaySelfSettleAuthorized>>,
  symbol: string,
): Promise<{ payer: string; transaction: string; network: string }> {
  const payload = paymentPayload.payload;
  const txB64 =
    payload && typeof payload === "object" && "transaction" in payload
      ? (payload as { transaction?: string }).transaction
      : undefined;
  if (!txB64 || typeof txB64 !== "string") {
    throw tokenPayError(symbol, "Missing signed transaction in payment payload");
  }

  const decoded = decodeSignedTxWire(txB64);
  const payerFallback = decoded.feePayer;
  const merchantId = merchantIdFromMatched(matched, merchant);

  const previewSig = decoded.signature;
  if (previewSig) {
    const replay = await tryAcceptCachedOrConfirmed(
      previewSig,
      matched,
      resourceKind,
      merchant,
      payerFallback,
    );
    if (replay) return replay;
  }

  const simOpts = { encoding: "base64", commitment: "confirmed", sigVerify: false } as const;
  // Parallel race — don't burn Edge budget walking slow RPCs sequentially.
  const sim = await solanaRpcParallelRace<{ value?: { err?: unknown } }>(
    "simulateTransaction",
    [txB64, simOpts],
    SIM_RPC_MS,
  );
  if (sim.ok && sim.result?.value?.err) {
    throw tokenPayError(symbol, "simulation failed — check TCX balance and SOL for fees");
  }

  const sendOpts = { encoding: "base64", skipPreflight: true, maxRetries: 2 };
  let signature: string | null = null;
  let send = await solanaRpcParallelRace<string>(
    "sendRawTransaction",
    [txB64, sendOpts],
    SEND_RPC_MS,
  );
  if (!send.ok && /method not found/i.test(send.error)) {
    send = await solanaRpcParallelRace<string>("sendTransaction", [txB64, sendOpts], SEND_RPC_MS);
  }
  if (send.ok && send.result) {
    signature = send.result;
  } else if (
    !send.ok &&
    send.error &&
    /already been processed|already processed|duplicate/i.test(send.error)
  ) {
    signature = decoded.signature;
  } else if (!send.ok) {
    throw tokenPayError(symbol, friendlyRpcError(send.error));
  }

  if (!signature) signature = decoded.signature;
  if (!signature) {
    throw tokenPayError(symbol, "failed to broadcast transaction");
  }

  // Anti-phantom: require on-chain confirmation (dropped/expired txs never confirm).
  // Do not finalize from broadcast success alone.
  const confirmed = await waitForSignatureConfirmed(signature);
  if (!confirmed) {
    throw tokenPayError(symbol, "could not verify transaction on-chain — retry in a few seconds");
  }

  const tx = await fetchConfirmedTransactionWithRetry(signature);
  if (tx?.meta?.err) {
    throw tokenPayError(symbol, "transaction failed on-chain");
  }
  if (tx && !merchantReceivedRequiredAmount(tx, matched)) {
    const delta = merchantMintDelta(
      tx.meta?.preTokenBalances,
      tx.meta?.postTokenBalances,
      matched.payTo,
      matched.asset,
    );
    if (delta > 0n) {
      throw tokenPayError(symbol, "amount does not match requirement");
    }
    // Confirmed but token balances missing from RPC meta — still accept.
  }

  const payer = (tx ? feePayerFromTxDetail(tx) : null) ?? payerFallback;
  if (!payer) {
    throw tokenPayError(symbol, "could not verify transaction on-chain — retry in a few seconds");
  }

  return finalizeSettlement({
    signature,
    payer,
    matched,
    resourceKind,
    merchantId,
    merchant,
  });
}
