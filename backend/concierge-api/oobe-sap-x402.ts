/**
 * OOBE Synapse SAP x402 bridge — verify on-chain settlement txs when PAYMENT-SIGNATURE
 * (PayAI facilitator) is absent. Edge-safe: fetch-only Solana RPC, optional KV dedup.
 */
import { atomicAmountForResource, type X402ResourceKind } from "./x402-pricing";
import { getMerchantAddresses, getSolanaRpcUrlForServer, getUsdcAssetForNetwork, getX402NetworkProfile } from "./x402-config";
import { solanaRpcCallEx } from "./x402-solana-rpc";

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
  blockTime?: number | null;
};

const OOBE_TX_HEADER_NAMES = [
  "x-oobe-settlement-tx",
  "x-payment-settlement",
  "x-payment-settlement-tx",
] as const;

const TX_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

const devUsedTx = new Set<string>();

export function isOobeSapPaymentEnabled(): boolean {
  const raw = (process.env.OOBE_SAP_X402_ENABLED ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
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

function feePayerFromTxDetail(tx: GetTxDetail): string | null {
  const keys = tx.transaction?.message?.accountKeys;
  if (!keys?.length) return null;
  const first = keys[0];
  if (typeof first === "string") return first;
  return first.pubkey ?? null;
}

function readSettlementTxHeader(request: Request): string | null {
  for (const name of OOBE_TX_HEADER_NAMES) {
    const v = request.headers.get(name)?.trim();
    if (v && TX_SIG_RE.test(v)) return v;
  }
  const hasOobeEscrow =
    request.headers.get("x-payment-amount") ||
    request.headers.get("X-PAYMENT-AMOUNT") ||
    request.headers.get("x-payment-escrow") ||
    request.headers.get("X-PAYMENT-ESCROW");
  if (hasOobeEscrow) {
    const sig = request.headers.get("x-payment-sig")?.trim() ?? request.headers.get("X-PAYMENT-SIG")?.trim();
    if (sig && TX_SIG_RE.test(sig)) return sig;
  }
  return null;
}

async function isSettlementTxFresh(blockTime: number | null | undefined): Promise<boolean> {
  if (!blockTime) return true;
  const maxAgeSec = Number(process.env.OOBE_SAP_TX_MAX_AGE_SEC ?? "3600");
  if (!Number.isFinite(maxAgeSec) || maxAgeSec <= 0) return true;
  const age = Math.floor(Date.now() / 1000) - blockTime;
  return age >= 0 && age <= maxAgeSec;
}

async function markSettlementTxUsed(signature: string): Promise<boolean> {
  const key = `oobe:settlement:${signature}`;
  if (hasRedis()) {
    const { kv } = await import("@vercel/kv");
    const existing = await kv.get<string>(key);
    if (existing) return false;
    await kv.set(key, "1", { ex: 86_400 });
    return true;
  }
  if (devUsedTx.has(signature)) return false;
  devUsedTx.add(signature);
  return true;
}

export type OobeSapVerifyResult =
  | { ok: true; payer: string; transaction: string }
  | { ok: false; reason: string };

export async function verifyOobeSapSettlement(
  request: Request,
  kind: X402ResourceKind,
): Promise<OobeSapVerifyResult | null> {
  if (!isOobeSapPaymentEnabled()) return null;

  const signature = readSettlementTxHeader(request);
  if (!signature) return null;

  const { sol } = getMerchantAddresses();
  if (!sol) {
    return { ok: false, reason: "OOBE SAP x402: Solana merchant address not configured" };
  }

  const rpc = getSolanaRpcUrlForServer();
  if (!rpc) {
    return { ok: false, reason: "OOBE SAP x402: SOLANA_RPC_URL required for settlement verification" };
  }

  const nets = getX402NetworkProfile();
  const mint = getUsdcAssetForNetwork(nets.sol);
  const required = BigInt(atomicAmountForResource(kind));

  const status = await solanaRpcCallEx<{ value?: { confirmationStatus?: string; err?: unknown }[] }>(
    rpc,
    "getSignatureStatuses",
    [[signature], { searchTransactionHistory: true }],
  );
  if (!status.ok) {
    return { ok: false, reason: `OOBE settlement RPC error: ${status.error}` };
  }
  const entry = status.result.value?.[0];
  if (entry?.err) {
    return { ok: false, reason: "OOBE settlement transaction failed on-chain" };
  }
  if (
    !entry?.confirmationStatus ||
    (entry.confirmationStatus !== "confirmed" && entry.confirmationStatus !== "finalized")
  ) {
    return { ok: false, reason: "OOBE settlement transaction not confirmed yet" };
  }

  const tx = await solanaRpcCallEx<GetTxDetail>(rpc, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!tx.ok || !tx.result) {
    return { ok: false, reason: "Could not load OOBE settlement transaction" };
  }
  if (tx.result.meta?.err) {
    return { ok: false, reason: "OOBE settlement transaction failed on-chain" };
  }

  if (!(await isSettlementTxFresh(tx.result.blockTime))) {
    return { ok: false, reason: "OOBE settlement transaction too old — submit a fresh payment" };
  }

  const delta = merchantMintDelta(tx.result.meta?.preTokenBalances, tx.result.meta?.postTokenBalances, sol, mint);
  if (delta < required) {
    return {
      ok: false,
      reason: `OOBE settlement USDC (${delta}) below required (${required}) for ${kind}`,
    };
  }

  const fresh = await markSettlementTxUsed(signature);
  if (!fresh) {
    return { ok: false, reason: "OOBE settlement transaction already used" };
  }

  const payer = feePayerFromTxDetail(tx.result);
  if (!payer) {
    return { ok: false, reason: "Could not read payer from OOBE settlement transaction" };
  }

  return { ok: true, payer, transaction: signature };
}

export function oobePaymentHintHeaders(): string {
  return "X-OOBE-SETTLEMENT-TX (or X-PAYMENT-SETTLEMENT) with confirmed Solana USDC tx signature";
}
