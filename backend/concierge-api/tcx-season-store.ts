/**
 * TCX Season payer ledger — durable per-wallet Token Pay usage for Season scoring.
 * Window starts TCX_SEASON_START (default 2026-07-16 UTC). Failures must not break settle.
 */
import { SOON_MERCHANT_ID } from "./token-pay/merchants/soon";

const OWNER_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_RESOURCE_KINDS = 24;

export type SeasonPayerRow = {
  paidCalls: number;
  volumeAtomic: string;
  firstAt: number;
  lastAt: number;
  lastTx: string;
  resourceKinds: string[];
};

const devPayers = new Map<string, SeasonPayerRow>();
const devPayerIndex = new Set<string>();

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function payerKey(merchantId: string, wallet: string): string {
  return `tcx-season:payer:${merchantId}:${wallet}`;
}

function payersIndexKey(merchantId: string): string {
  return `tcx-season:payers:${merchantId}`;
}

function normalizeWallet(wallet: string): string | null {
  const w = wallet.trim();
  return OWNER_RE.test(w) ? w : null;
}

function mergeResourceKinds(prev: string[], kind: string): string[] {
  const next = prev.includes(kind) ? prev : [...prev, kind];
  return next.slice(0, MAX_RESOURCE_KINDS);
}

export function scheduleSeasonPayerCredit(input: {
  merchantId: string;
  payer: string;
  amountAtomic: string;
  resourceKind: string;
  tx: string;
  at?: number;
}): void {
  void creditSeasonPayer(input).catch((e) => {
    console.error("[tcx-season]", e instanceof Error ? e.message : e);
  });
}

export async function creditSeasonPayer(input: {
  merchantId: string;
  payer: string;
  amountAtomic: string;
  resourceKind: string;
  tx: string;
  at?: number;
}): Promise<void> {
  if (input.merchantId !== SOON_MERCHANT_ID) return;
  const wallet = normalizeWallet(input.payer);
  if (!wallet) return;

  const at = input.at ?? Date.now();
  const amount = BigInt(input.amountAtomic || "0");
  if (amount < 0n) return;

  const key = payerKey(input.merchantId, wallet);

  if (hasRedis()) {
    const kv = await kvClient();
    const prev =
      (await kv.get<SeasonPayerRow>(key)) ??
      ({
        paidCalls: 0,
        volumeAtomic: "0",
        firstAt: at,
        lastAt: at,
        lastTx: "",
        resourceKinds: [],
      } satisfies SeasonPayerRow);

    const next: SeasonPayerRow = {
      paidCalls: prev.paidCalls + 1,
      volumeAtomic: (BigInt(prev.volumeAtomic || "0") + amount).toString(),
      firstAt: prev.paidCalls > 0 ? prev.firstAt : at,
      lastAt: at,
      lastTx: input.tx,
      resourceKinds: mergeResourceKinds(prev.resourceKinds ?? [], input.resourceKind),
    };
    await kv.set(key, next);
    await kv.sadd(payersIndexKey(input.merchantId), wallet);
    return;
  }

  const prev = devPayers.get(key) ?? {
    paidCalls: 0,
    volumeAtomic: "0",
    firstAt: at,
    lastAt: at,
    lastTx: "",
    resourceKinds: [] as string[],
  };
  const next: SeasonPayerRow = {
    paidCalls: prev.paidCalls + 1,
    volumeAtomic: (BigInt(prev.volumeAtomic || "0") + amount).toString(),
    firstAt: prev.paidCalls > 0 ? prev.firstAt : at,
    lastAt: at,
    lastTx: input.tx,
    resourceKinds: mergeResourceKinds(prev.resourceKinds ?? [], input.resourceKind),
  };
  devPayers.set(key, next);
  devPayerIndex.add(wallet);
}

export async function getSeasonPayer(
  merchantId: string,
  wallet: string,
): Promise<SeasonPayerRow | null> {
  const w = normalizeWallet(wallet);
  if (!w) return null;
  const key = payerKey(merchantId, w);

  if (hasRedis()) {
    const kv = await kvClient();
    return (await kv.get<SeasonPayerRow>(key)) ?? null;
  }
  return devPayers.get(key) ?? null;
}

export async function listSeasonPayerWallets(merchantId: string): Promise<string[]> {
  if (hasRedis()) {
    const kv = await kvClient();
    const members = await kv.smembers(payersIndexKey(merchantId));
    return (members ?? []).filter((m): m is string => typeof m === "string" && OWNER_RE.test(m));
  }
  return [...devPayerIndex];
}

export async function listSeasonPayers(
  merchantId: string,
): Promise<Array<{ wallet: string; row: SeasonPayerRow }>> {
  const wallets = await listSeasonPayerWallets(merchantId);
  const out: Array<{ wallet: string; row: SeasonPayerRow }> = [];
  for (const wallet of wallets) {
    const row = await getSeasonPayer(merchantId, wallet);
    if (row && row.paidCalls > 0) out.push({ wallet, row });
  }
  return out;
}
