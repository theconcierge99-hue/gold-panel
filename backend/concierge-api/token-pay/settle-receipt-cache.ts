/** Idempotent Token Pay receipts — replay same PAYMENT-SIGNATURE without rebroadcast. */
const RECEIPT_TTL_SEC = 7 * 86_400;

export type TokenPaySettleReceipt = {
  signature: string;
  payer: string;
  network: string;
  merchantId: string;
  mint: string;
  amountAtomic: string;
  resourceKind: string;
  at: number;
};

const devReceipts = new Map<string, TokenPaySettleReceipt>();

function receiptKey(signature: string): string {
  return `token-pay:settle:${signature}`;
}

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

export async function getTokenPaySettleReceipt(
  signature: string,
): Promise<TokenPaySettleReceipt | null> {
  const sig = signature.trim();
  if (!sig) return null;

  if (hasRedis()) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<TokenPaySettleReceipt>(receiptKey(sig))) ?? null;
  }
  return devReceipts.get(sig) ?? null;
}

export async function putTokenPaySettleReceipt(receipt: TokenPaySettleReceipt): Promise<void> {
  const sig = receipt.signature.trim();
  if (!sig) return;

  if (hasRedis()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(receiptKey(sig), receipt, { ex: RECEIPT_TTL_SEC });
    return;
  }
  devReceipts.set(sig, receipt);
}
