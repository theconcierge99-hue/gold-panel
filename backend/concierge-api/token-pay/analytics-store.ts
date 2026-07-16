/**
 * Token Pay settlement analytics — KV-backed (in-memory when Redis unset).
 */
import { getTokenPayMerchant } from "./registry";
import type { TokenPayMerchant } from "./types";
import { scheduleSeasonPayerCredit } from "../tcx-season-store";
import { isInSeasonWindow } from "../tcx-season-core";

const MAX_RECENT = 40;
const MAX_DAILY_DAYS = 90;

export type TokenPaySettlementRecord = {
  tx: string;
  merchantId: string;
  symbol: string;
  mint: string;
  amountAtomic: string;
  resourceKind: string;
  payer: string;
  at: number;
  /** USDC list price × 1e6 at settlement (optional — backfilled from route tier if absent). */
  listUsdcMicro?: number;
  /** Effective USDC after TCX discount × 1e6 (optional). */
  effectiveUsdcMicro?: number;
};

export type TokenPayDailyRollup = {
  date: string;
  txCount: number;
  volumeAtomic: string;
  listUsdcMicro?: string;
  effectiveUsdcMicro?: string;
};

export type TokenPayMerchantAnalytics = {
  merchantId: string;
  symbol: string;
  mint: string | null;
  txCount: number;
  volumeAtomic: string;
  volumeLabel: string;
  listUsdcMicro: string;
  effectiveUsdcMicro: string;
  lastTxAt: number | null;
  lastTx: string | null;
  daily: TokenPayDailyRollup[];
  recent: TokenPaySettlementRecord[];
  kvEnabled: boolean;
};

type MerchantTotals = {
  txCount: number;
  volumeAtomic: bigint;
  listUsdcMicro: bigint;
  effectiveUsdcMicro: bigint;
  lastTxAt: number | null;
  lastTx: string | null;
};

const devTotals = new Map<string, MerchantTotals>();
const devDaily = new Map<string, TokenPayDailyRollup>();
const devRecent = new Map<string, TokenPaySettlementRecord[]>();

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function totalsKey(merchantId: string): string {
  return `token-pay:totals:${merchantId}`;
}

function dailyKey(merchantId: string, date: string): string {
  return `token-pay:daily:${merchantId}:${date}`;
}

function recentKey(merchantId: string): string {
  return `token-pay:recent:${merchantId}`;
}

function utcDateKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function formatVolume(atomic: bigint, merchant: TokenPayMerchant | null): string {
  const decimals = merchant?.decimals ?? 6;
  const div = 10n ** BigInt(decimals);
  const whole = atomic / div;
  const frac = atomic % div;
  const sym = merchant?.symbol ?? "TOKEN";
  if (frac === 0n) return `${whole.toLocaleString("en-US")} ${sym}`;
  const fracStr = frac.toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}.${fracStr} ${sym}`;
}

export function scheduleTokenPaySettlementRecord(input: {
  merchantId: string;
  mint: string;
  amountAtomic: string;
  resourceKind: string;
  payer: string;
  tx: string;
  listUsdcMicro?: number;
  effectiveUsdcMicro?: number;
}): void {
  void recordTokenPaySettlement(input).catch((e) => {
    console.error("[token-pay analytics]", e instanceof Error ? e.message : e);
  });
}

export async function recordTokenPaySettlement(input: {
  merchantId: string;
  mint: string;
  amountAtomic: string;
  resourceKind: string;
  payer: string;
  tx: string;
  listUsdcMicro?: number;
  effectiveUsdcMicro?: number;
}): Promise<void> {
  const merchant = getTokenPayMerchant(input.merchantId);
  const at = Date.now();
  const date = utcDateKey(at);
  const amount = BigInt(input.amountAtomic);
  const listMicro = BigInt(Math.max(0, Math.round(input.listUsdcMicro ?? 0)));
  const effectiveMicro = BigInt(
    Math.max(0, Math.round(input.effectiveUsdcMicro ?? input.listUsdcMicro ?? 0)),
  );

  const event: TokenPaySettlementRecord = {
    tx: input.tx,
    merchantId: input.merchantId,
    symbol: merchant?.symbol ?? input.merchantId,
    mint: input.mint,
    amountAtomic: input.amountAtomic,
    resourceKind: input.resourceKind,
    payer: input.payer,
    at,
    ...(listMicro > 0n ? { listUsdcMicro: Number(listMicro) } : {}),
    ...(effectiveMicro > 0n ? { effectiveUsdcMicro: Number(effectiveMicro) } : {}),
  };

  if (isInSeasonWindow(at)) {
    scheduleSeasonPayerCredit({
      merchantId: input.merchantId,
      payer: input.payer,
      amountAtomic: input.amountAtomic,
      resourceKind: input.resourceKind,
      tx: input.tx,
      at,
    });
  }

  if (hasRedis()) {
    const kv = await kvClient();
    const totals =
      (await kv.get<{
        txCount: number;
        volumeAtomic: string;
        listUsdcMicro?: string;
        effectiveUsdcMicro?: string;
        lastTxAt: number | null;
        lastTx: string | null;
      }>(totalsKey(input.merchantId))) ?? {
        txCount: 0,
        volumeAtomic: "0",
        listUsdcMicro: "0",
        effectiveUsdcMicro: "0",
        lastTxAt: null,
        lastTx: null,
      };
    const prevVol = BigInt(totals.volumeAtomic || "0");
    const prevList = BigInt(totals.listUsdcMicro ?? "0");
    const prevEff = BigInt(totals.effectiveUsdcMicro ?? "0");
    const nextTotals: MerchantTotals = {
      txCount: totals.txCount + 1,
      volumeAtomic: prevVol + amount,
      listUsdcMicro: prevList + listMicro,
      effectiveUsdcMicro: prevEff + effectiveMicro,
      lastTxAt: at,
      lastTx: input.tx,
    };
    await kv.set(totalsKey(input.merchantId), {
      ...nextTotals,
      volumeAtomic: nextTotals.volumeAtomic.toString(),
      listUsdcMicro: nextTotals.listUsdcMicro.toString(),
      effectiveUsdcMicro: nextTotals.effectiveUsdcMicro.toString(),
    });

    const dayKey = dailyKey(input.merchantId, date);
    const day =
      (await kv.get<{
        txCount: number;
        volumeAtomic: string;
        listUsdcMicro?: string;
        effectiveUsdcMicro?: string;
      }>(dayKey)) ?? {
        txCount: 0,
        volumeAtomic: "0",
        listUsdcMicro: "0",
        effectiveUsdcMicro: "0",
      };
    await kv.set(dayKey, {
      txCount: day.txCount + 1,
      volumeAtomic: (BigInt(day.volumeAtomic) + amount).toString(),
      listUsdcMicro: (BigInt(day.listUsdcMicro ?? "0") + listMicro).toString(),
      effectiveUsdcMicro: (BigInt(day.effectiveUsdcMicro ?? "0") + effectiveMicro).toString(),
    });

    await kv.lpush(recentKey(input.merchantId), event);
    await kv.ltrim(recentKey(input.merchantId), 0, MAX_RECENT - 1);
    return;
  }

  const t =
    devTotals.get(input.merchantId) ?? {
      txCount: 0,
      volumeAtomic: 0n,
      listUsdcMicro: 0n,
      effectiveUsdcMicro: 0n,
      lastTxAt: null,
      lastTx: null,
    };
  devTotals.set(input.merchantId, {
    txCount: t.txCount + 1,
    volumeAtomic: t.volumeAtomic + amount,
    listUsdcMicro: t.listUsdcMicro + listMicro,
    effectiveUsdcMicro: t.effectiveUsdcMicro + effectiveMicro,
    lastTxAt: at,
    lastTx: input.tx,
  });

  const dk = `${input.merchantId}:${date}`;
  const d = devDaily.get(dk) ?? {
    date,
    txCount: 0,
    volumeAtomic: "0",
    listUsdcMicro: "0",
    effectiveUsdcMicro: "0",
  };
  devDaily.set(dk, {
    date,
    txCount: d.txCount + 1,
    volumeAtomic: (BigInt(d.volumeAtomic) + amount).toString(),
    listUsdcMicro: (BigInt(d.listUsdcMicro ?? "0") + listMicro).toString(),
    effectiveUsdcMicro: (BigInt(d.effectiveUsdcMicro ?? "0") + effectiveMicro).toString(),
  });

  const rec = devRecent.get(input.merchantId) ?? [];
  devRecent.set(input.merchantId, [event, ...rec].slice(0, MAX_RECENT));
}

export async function getTokenPayMerchantAnalytics(
  merchantId: string,
  days = 14,
): Promise<TokenPayMerchantAnalytics | null> {
  const merchant = getTokenPayMerchant(merchantId);
  if (!merchant) return null;

  const span = Math.min(Math.max(days, 1), MAX_DAILY_DAYS);
  const daily: TokenPayDailyRollup[] = [];
  let recent: TokenPaySettlementRecord[] = [];
  let totals: MerchantTotals = {
    txCount: 0,
    volumeAtomic: 0n,
    listUsdcMicro: 0n,
    effectiveUsdcMicro: 0n,
    lastTxAt: null,
    lastTx: null,
  };

  if (hasRedis()) {
    const kv = await kvClient();
    const raw = await kv.get<{
      txCount: number;
      volumeAtomic: string;
      listUsdcMicro?: string;
      effectiveUsdcMicro?: string;
      lastTxAt: number | null;
      lastTx: string | null;
    }>(totalsKey(merchantId));
    if (raw) {
      totals = {
        txCount: raw.txCount,
        volumeAtomic: BigInt(raw.volumeAtomic || "0"),
        listUsdcMicro: BigInt(raw.listUsdcMicro ?? "0"),
        effectiveUsdcMicro: BigInt(raw.effectiveUsdcMicro ?? "0"),
        lastTxAt: raw.lastTxAt,
        lastTx: raw.lastTx,
      };
    }
    recent = (await kv.lrange<TokenPaySettlementRecord>(recentKey(merchantId), 0, MAX_RECENT - 1)) ?? [];

    const now = Date.now();
    for (let i = span - 1; i >= 0; i--) {
      const d = utcDateKey(now - i * 86_400_000);
      const row = await kv.get<{
        txCount: number;
        volumeAtomic: string;
        listUsdcMicro?: string;
        effectiveUsdcMicro?: string;
      }>(dailyKey(merchantId, d));
      daily.push({
        date: d,
        txCount: row?.txCount ?? 0,
        volumeAtomic: row?.volumeAtomic ?? "0",
        listUsdcMicro: row?.listUsdcMicro,
        effectiveUsdcMicro: row?.effectiveUsdcMicro,
      });
    }
  } else {
    totals = devTotals.get(merchantId) ?? totals;
    recent = devRecent.get(merchantId) ?? [];
    const now = Date.now();
    for (let i = span - 1; i >= 0; i--) {
      const d = utcDateKey(now - i * 86_400_000);
      const row = devDaily.get(`${merchantId}:${d}`);
      daily.push(
        row ?? {
          date: d,
          txCount: 0,
          volumeAtomic: "0",
          listUsdcMicro: "0",
          effectiveUsdcMicro: "0",
        },
      );
    }
  }

  return {
    merchantId,
    symbol: merchant.symbol,
    mint: merchant.mint,
    txCount: totals.txCount,
    volumeAtomic: totals.volumeAtomic.toString(),
    volumeLabel: formatVolume(totals.volumeAtomic, merchant),
    listUsdcMicro: totals.listUsdcMicro.toString(),
    effectiveUsdcMicro: totals.effectiveUsdcMicro.toString(),
    lastTxAt: totals.lastTxAt,
    lastTx: totals.lastTx,
    daily,
    recent,
    kvEnabled: hasRedis(),
  };
}

export function listTokenPayMerchantsWithAnalytics(): string[] {
  if (!hasRedis()) return [...devTotals.keys()];
  return [];
}
