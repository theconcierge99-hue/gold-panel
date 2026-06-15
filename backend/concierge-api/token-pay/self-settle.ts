/**
 * Self-settle verify + broadcast for any Token Pay merchant (Edge-safe, fetch RPC only).
 */
import { getSolanaRpcUrlForServer } from "../x402-config";
import { solanaRpcCallEx } from "../x402-solana-rpc";
import type { TokenPayPaymentPayload, TokenPaySelfSettleRequirement } from "./types";

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

export function isTokenPaySelfSettleRequirement(req: { extra?: Record<string, unknown> }): boolean {
  return req.extra?.settlement === "self";
}

function tokenSymbolFromExtra(extra?: Record<string, unknown>): string {
  const name = extra?.name;
  return typeof name === "string" && name ? name : "token";
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
): Promise<{ payer: string; transaction: string; network: string }> {
  const symbol = tokenSymbolFromExtra(matched.extra);
  const payload = paymentPayload.payload;
  const txB64 =
    payload && typeof payload === "object" && "transaction" in payload
      ? (payload as { transaction?: string }).transaction
      : undefined;
  if (!txB64 || typeof txB64 !== "string") {
    throw new Error("Missing signed transaction in payment payload");
  }

  const rpc = getSolanaRpcUrlForServer();
  const requiredAmount = BigInt(matched.amount);

  const sim = await solanaRpcCallEx<{ value?: { err?: unknown } }>(rpc, "simulateTransaction", [
    txB64,
    { encoding: "base64", commitment: "confirmed", sigVerify: true },
  ]);
  if (!sim.ok) throw new Error(sim.error || `${symbol} payment simulation failed`);
  if (sim.result.value?.err) {
    throw new Error(`${symbol} payment simulation failed — check balance and SOL for fees`);
  }

  const send = await solanaRpcCallEx<string>(rpc, "sendRawTransaction", [
    txB64,
    { encoding: "base64", skipPreflight: true, maxRetries: 3 },
  ]);
  if (!send.ok) {
    throw new Error(send.error || `Failed to broadcast ${symbol} payment`);
  }
  if (!send.result) {
    throw new Error(`Failed to broadcast ${symbol} payment`);
  }

  const signature = send.result;
  const confirmed = await waitForConfirmation(rpc, signature);
  if (!confirmed) {
    throw new Error(`${symbol} payment broadcast but not confirmed — retry or check explorer`);
  }

  const tx = await solanaRpcCallEx<GetTxDetail>(rpc, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!tx.ok || !tx.result) {
    throw new Error(`Could not verify ${symbol} payment on-chain`);
  }
  if (tx.result.meta?.err) {
    throw new Error(`${symbol} payment transaction failed on-chain`);
  }

  const delta = merchantMintDelta(
    tx.result.meta?.preTokenBalances,
    tx.result.meta?.postTokenBalances,
    matched.payTo,
    matched.asset,
  );
  if (delta < requiredAmount) {
    throw new Error(`${symbol} payment amount does not match requirement`);
  }

  const payer = feePayerFromTxDetail(tx.result);
  if (!payer) {
    throw new Error("Could not read fee payer from confirmed transaction");
  }

  return {
    payer,
    transaction: signature,
    network: matched.network,
  };
}
