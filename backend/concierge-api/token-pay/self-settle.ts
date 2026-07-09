/**
 * Self-settle verify + broadcast for any Token Pay merchant (Edge-safe, fetch RPC only).
 */
import { getSolanaRpcUrlForServer } from "../x402-config";
import { priceUsdcForResource, type X402ResourceKind } from "../x402-pricing";
import { solanaRpcCallEx } from "../x402-solana-rpc";
import { assertTokenPaySelfSettleAuthorized } from "./security";
import { tokenPayAtomicForResourceAsync } from "./x402";
import { scheduleTokenPaySettlementRecord } from "./analytics-store";
import type { TokenPayPaymentPayload, TokenPaySelfSettleRequirement } from "./types";

export { isTokenPaySelfSettleRequirement } from "./security";

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

async function waitForConfirmation(rpc: string, signature: string, attempts = 25): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const status = await solanaRpcCallEx<{ value?: { confirmationStatus?: string; err?: unknown }[] }>(
      rpc,
      "getSignatureStatuses",
      [[signature], { searchTransactionHistory: true }],
    );
    const entry = status.ok ? status.result.value?.[0] : null;
    if (entry?.err) return false;
    if (
      entry?.confirmationStatus === "confirmed" ||
      entry?.confirmationStatus === "finalized" ||
      entry?.confirmationStatus === "processed"
    ) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
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

  const rpc = getSolanaRpcUrlForServer();
  const requiredAmount = BigInt(matched.amount);

  const usdcList = priceUsdcForResource(resourceKind as X402ResourceKind);
  const freshMin = await tokenPayAtomicForResourceAsync(usdcList, merchant);
  if (freshMin) {
    const floor = (BigInt(freshMin) * 85n) / 100n;
    if (requiredAmount < floor) {
      throw tokenPayError(symbol, "quoted amount expired — hard refresh and pay again");
    }
  }

  const simOpts = { encoding: "base64", commitment: "confirmed", sigVerify: true } as const;
  let sim = await solanaRpcCallEx<{ value?: { err?: unknown } }>(rpc, "simulateTransaction", [
    txB64,
    simOpts,
  ]);
  if (!sim.ok || sim.result?.value?.err) {
    sim = await solanaRpcCallEx<{ value?: { err?: unknown } }>(rpc, "simulateTransaction", [
      txB64,
      { ...simOpts, sigVerify: false },
    ]);
  }
  if (!sim.ok) throw tokenPayError(symbol, sim.error || "simulation failed");
  if (sim.result?.value?.err) {
    throw tokenPayError(symbol, "simulation failed — check TCX balance and SOL for fees");
  }

  const send = await solanaRpcCallEx<string>(rpc, "sendRawTransaction", [
    txB64,
    { encoding: "base64", skipPreflight: true, maxRetries: 3 },
  ]);
  if (!send.ok) {
    throw tokenPayError(symbol, send.error || "failed to broadcast transaction");
  }
  if (!send.result) {
    throw tokenPayError(symbol, "failed to broadcast transaction");
  }

  const signature = send.result;
  const confirmed = await waitForConfirmation(rpc, signature);
  if (!confirmed) {
    throw tokenPayError(symbol, "broadcast but not confirmed — retry or check explorer");
  }

  const tx = await solanaRpcCallEx<GetTxDetail>(rpc, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!tx.ok || !tx.result) {
    throw tokenPayError(symbol, "could not verify transaction on-chain");
  }
  if (tx.result.meta?.err) {
    throw tokenPayError(symbol, "transaction failed on-chain");
  }

  const delta = merchantMintDelta(
    tx.result.meta?.preTokenBalances,
    tx.result.meta?.postTokenBalances,
    matched.payTo,
    matched.asset,
  );
  if (delta < requiredAmount) {
    throw tokenPayError(symbol, "amount does not match requirement");
  }

  const payer = feePayerFromTxDetail(tx.result);
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
