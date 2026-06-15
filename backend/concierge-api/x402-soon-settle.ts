import { VersionedTransaction } from "@solana/web3.js";
import { getSolanaRpcUrlForServer } from "./x402-config";
import { solanaRpcCallEx } from "./x402-solana-rpc";

export type SoonAcceptRequirement = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

type SoonPaymentPayload = {
  x402Version?: number;
  accepted?: SoonAcceptRequirement;
  payload?: { transaction?: string };
};

type TokenBalanceRow = {
  owner?: string;
  mint?: string;
  uiTokenAmount?: { amount?: string };
};

export function isSelfSettleRequirement(req: { extra?: Record<string, unknown> }): boolean {
  return req.extra?.settlement === "self";
}

function txFeePayer(txB64: string): string {
  const raw =
    typeof Buffer !== "undefined"
      ? Buffer.from(txB64, "base64")
      : Uint8Array.from(atob(txB64), (c) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(raw);
  const payer = tx.message.staticAccountKeys[0];
  if (!payer) throw new Error("Could not read fee payer from transaction");
  return payer.toBase58();
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

/** Merchant self-settle: broadcast user-signed SOON transfer and confirm on-chain (no facilitator). */
export async function verifyAndSettleSoonSelf(
  paymentPayload: SoonPaymentPayload,
  matched: SoonAcceptRequirement,
): Promise<{ payer: string; transaction: string; network: string }> {
  const txB64 = paymentPayload.payload?.transaction;
  if (!txB64 || typeof txB64 !== "string") {
    throw new Error("Missing signed transaction in payment payload");
  }

  const rpc = getSolanaRpcUrlForServer();
  const requiredAmount = BigInt(matched.amount);

  const sim = await solanaRpcCallEx<{ value?: { err?: unknown } }>(rpc, "simulateTransaction", [
    txB64,
    { encoding: "base64", commitment: "confirmed", sigVerify: true },
  ]);
  if (!sim.ok) throw new Error(sim.error || "SOON payment simulation failed");
  if (sim.result.value?.err) {
    throw new Error("SOON payment simulation failed — check SOON balance and SOL for fees");
  }

  const send = await solanaRpcCallEx<string>(rpc, "sendRawTransaction", [
    txB64,
    { encoding: "base64", skipPreflight: true, maxRetries: 3 },
  ]);
  if (!send.ok || !send.result) {
    throw new Error(send.error || "Failed to broadcast SOON payment");
  }

  const signature = send.result;
  const confirmed = await waitForConfirmation(rpc, signature);
  if (!confirmed) {
    throw new Error("SOON payment broadcast but not confirmed — retry or check explorer");
  }

  const tx = await solanaRpcCallEx<{
    meta?: {
      err?: unknown;
      preTokenBalances?: TokenBalanceRow[];
      postTokenBalances?: TokenBalanceRow[];
    };
  }>(rpc, "getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
  if (!tx.ok || !tx.result) {
    throw new Error("Could not verify SOON payment on-chain");
  }
  if (tx.result.meta?.err) {
    throw new Error("SOON payment transaction failed on-chain");
  }

  const delta = merchantMintDelta(
    tx.result.meta?.preTokenBalances,
    tx.result.meta?.postTokenBalances,
    matched.payTo,
    matched.asset,
  );
  if (delta < requiredAmount) {
    throw new Error("SOON payment amount does not match requirement");
  }

  return {
    payer: txFeePayer(txB64),
    transaction: signature,
    network: matched.network,
  };
}
