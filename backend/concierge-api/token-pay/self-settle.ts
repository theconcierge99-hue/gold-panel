/**
 * Self-settle verify + broadcast for any Token Pay merchant (Edge-safe, fetch RPC only).
 */
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { priceUsdcForResource, type X402ResourceKind } from "../x402-pricing";
import { solanaRpcCallWithFallback } from "../x402-solana-rpc";
import { assertTokenPaySelfSettleAuthorized } from "./security";
import { tokenPayAtomicForResourceAsync } from "./x402";
import { scheduleTokenPaySettlementRecord } from "./analytics-store";
import type { TokenPayPaymentPayload, TokenPaySelfSettleRequirement } from "./types";

export { isTokenPaySelfSettleRequirement } from "./security";

const SETTLE_RPC_MS = 12_000;
const TX_POLL_MS = 300;
const TX_POLL_MAX = 22;

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

function tokenSymbolFromExtra(extra?: Record<string, unknown>): string {
  const name = extra?.name;
  return typeof name === "string" && name ? name : "token";
}

function tokenPayError(symbol: string, message: string): Error {
  return new Error(`${symbol} payment: ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function feePayerFromTxDetail(tx: GetTxDetail): string | null {
  const keys = tx.transaction?.message?.accountKeys;
  if (!keys?.length) return null;
  const first = keys[0];
  if (typeof first === "string") return first;
  return first.pubkey ?? null;
}

function feePayerFromSignedTxBase64(txB64: string): string | null {
  try {
    const wire = Uint8Array.from(atob(txB64), (c) => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(wire);
    return tx.message.staticAccountKeys[0]?.toBase58() ?? null;
  } catch {
    return null;
  }
}

function signatureFromSignedTxBase64(txB64: string): string | null {
  try {
    const wire = Uint8Array.from(atob(txB64), (c) => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(wire);
    const sig = tx.signatures[0];
    if (!sig || sig.every((b) => b === 0)) return null;
    return bs58.encode(sig);
  } catch {
    return null;
  }
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

async function fetchConfirmedTransaction(signature: string): Promise<GetTxDetail | null> {
  const opts = {
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 1,
    commitment: "confirmed",
  };
  for (let i = 0; i < TX_POLL_MAX; i++) {
    const tx = await solanaRpcCallWithFallback<GetTxDetail | null>(
      "getTransaction",
      [signature, opts],
      SETTLE_RPC_MS,
    );
    if (tx.ok && tx.result) return tx.result;
    await sleep(TX_POLL_MS);
  }
  return null;
}

async function signatureLooksFinalized(signature: string): Promise<boolean> {
  const status = await solanaRpcCallWithFallback<{
    value?: { confirmationStatus?: string; err?: unknown }[];
  }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }], SETTLE_RPC_MS);
  const entry = status.ok ? status.result.value?.[0] : null;
  if (entry?.err) return false;
  return (
    entry?.confirmationStatus === "confirmed" ||
    entry?.confirmationStatus === "finalized" ||
    entry?.confirmationStatus === "processed"
  );
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
    throw tokenPayError(symbol, msg);
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

  const requiredAmount = BigInt(matched.amount);
  const payerFallback = feePayerFromSignedTxBase64(txB64);

  const usdcList = priceUsdcForResource(resourceKind as X402ResourceKind);
  const freshMin = await tokenPayAtomicForResourceAsync(usdcList, merchant);
  if (freshMin) {
    const floor = (BigInt(freshMin) * 85n) / 100n;
    if (requiredAmount < floor) {
      throw tokenPayError(symbol, "quoted amount expired — hard refresh and pay again");
    }
  }

  const simOpts = { encoding: "base64", commitment: "confirmed", sigVerify: false } as const;
  const sim = await solanaRpcCallWithFallback<{ value?: { err?: unknown } }>(
    "simulateTransaction",
    [txB64, simOpts],
    10_000,
  );
  if (sim.ok && sim.result?.value?.err) {
    throw tokenPayError(symbol, "simulation failed — check TCX balance and SOL for fees");
  }

  const sendOpts = { encoding: "base64", skipPreflight: true, maxRetries: 2 };
  let signature: string | null = null;
  let send = await solanaRpcCallWithFallback<string>(
    "sendRawTransaction",
    [txB64, sendOpts],
    SETTLE_RPC_MS,
  );
  if (!send.ok && /method not found/i.test(send.error)) {
    send = await solanaRpcCallWithFallback<string>(
      "sendTransaction",
      [txB64, sendOpts],
      SETTLE_RPC_MS,
    );
  }
  if (send.ok && send.result) {
    signature = send.result;
  } else if (
    send.error &&
    /already been processed|already processed|duplicate/i.test(send.error)
  ) {
    signature = signatureFromSignedTxBase64(txB64);
  } else if (!send.ok) {
    throw tokenPayError(
      symbol,
      send.error.startsWith("RPC HTTP") || /method not found/i.test(send.error)
        ? "Solana RPC misconfigured — set SOLANA_RPC_URL to https://mainnet.helius-rpc.com/?api-key=KEY or remove it for publicnode fallback"
        : send.error || "failed to broadcast transaction",
    );
  }

  if (!signature) {
    signature = signatureFromSignedTxBase64(txB64);
  }
  if (!signature) {
    throw tokenPayError(symbol, "failed to broadcast transaction");
  }

  const tx = await fetchConfirmedTransaction(signature);
  if (!tx) {
    const finalized = await signatureLooksFinalized(signature);
    if (finalized && payerFallback) {
      scheduleTokenPaySettlementRecord({
        merchantId:
          typeof matched.extra?.merchantId === "string"
            ? matched.extra.merchantId.trim()
            : merchant.id,
        mint: matched.asset,
        amountAtomic: matched.amount,
        resourceKind,
        payer: payerFallback,
        tx: signature,
      });
      return {
        payer: payerFallback,
        transaction: signature,
        network: matched.network,
      };
    }
    throw tokenPayError(symbol, "could not verify transaction on-chain — retry in a few seconds");
  }

  if (tx.meta?.err) {
    throw tokenPayError(symbol, "transaction failed on-chain");
  }

  const delta = merchantMintDelta(
    tx.meta?.preTokenBalances,
    tx.meta?.postTokenBalances,
    matched.payTo,
    matched.asset,
  );
  if (delta > 0n && delta < requiredAmount) {
    throw tokenPayError(symbol, "amount does not match requirement");
  }
  if (delta <= 0n && !(await signatureLooksFinalized(signature))) {
    throw tokenPayError(symbol, "could not verify transaction on-chain — retry in a few seconds");
  }

  const payer = feePayerFromTxDetail(tx) ?? payerFallback;
  if (!payer) {
    throw tokenPayError(symbol, "could not read fee payer from confirmed transaction");
  }

  const merchantId =
    typeof matched.extra?.merchantId === "string" ? matched.extra.merchantId.trim() : merchant.id;
  scheduleTokenPaySettlementRecord({
    merchantId,
    mint: matched.asset,
    amountAtomic: matched.amount,
    resourceKind,
    payer,
    tx: signature,
  });

  return {
    payer,
    transaction: signature,
    network: matched.network,
  };
}
