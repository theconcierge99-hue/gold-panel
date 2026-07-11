/**
 * Live TCX transparency payload — aggregates Token Pay analytics into weekly ledger rows.
 */
import { getTokenPayMerchantAnalytics, type TokenPayDailyRollup, type TokenPaySettlementRecord } from "./token-pay/analytics-store";
import { SOON_MERCHANT_ID } from "./token-pay/merchants/soon";
import { effectiveUsdcForTokenPay } from "./token-pay/x402";
import { getDefaultTokenPayMerchant } from "./token-pay/registry";
import { priceUsdcForResource, type X402ResourceKind } from "./x402-pricing";

const BUYBACK_MIN_USD = 40;
const BUYBACK_BUDGET_PCT = 0.15;
const TCX_BURN_PCT = 0.8;
const WEEK_DAYS = 7;
const MS_DAY = 86_400_000;

export type TcxTransparencyLink = { label: string; url: string };

export type TcxTransparencyWeek = {
  weekEnd: string;
  periodStart: string;
  periodEnd: string;
  status: "in_progress" | "published";
  recapPublish: string;
  netUsd: number;
  revenueUsdcEquivalent: number;
  revenueListUsdc: number;
  buybackUsd: number;
  buybackNote?: string;
  tcxReceived: number;
  tcxBurned: number;
  lpUsd: number;
  txCount: number;
  burnTx?: string;
  lpTx?: string;
  links: TcxTransparencyLink[];
};

export type TcxTransparencyPayload = {
  version: number;
  source: "live" | "override";
  launchDate: string;
  mint: string;
  cadence: {
    weekLengthDays: number;
    anchor: string;
    publishDay: string;
    timezone: string;
    refreshSeconds: number;
    note: string;
  };
  snapshotAt: string;
  snapshotNote: string;
  totals: {
    revenueUsdcEquivalent: number;
    revenueListUsdc: number;
    usdcNet: number;
    tcxReceived: number;
    tcxBurned: number;
    txCount: number;
    usdcTxCount: number;
    tcxTxCount: number;
  };
  weeks: TcxTransparencyWeek[];
  links: {
    analytics: string;
    transparencyApi: string;
  };
};

function launchDateFromEnv(): string {
  const raw = (process.env.TCX_LAUNCH_DATE ?? "2026-07-07").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "2026-07-07";
}

function merchantIdFromEnv(): string {
  return (process.env.TCX_TRANSPARENCY_MERCHANT ?? SOON_MERCHANT_ID).trim() || SOON_MERCHANT_ID;
}

function parseOverride(): Partial<TcxTransparencyPayload> | null {
  const raw = (process.env.TCX_TRANSPARENCY_OVERRIDE_JSON ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<TcxTransparencyPayload>;
  } catch {
    return null;
  }
}

function parseUtcDate(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function utcDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  return utcDateStr(parseUtcDate(date) + days * MS_DAY);
}

function microToUsd(micro: bigint): number {
  return Number(micro) / 1_000_000;
}

function atomicToUi(atomic: bigint, decimals = 6): number {
  return Number(atomic) / 10 ** decimals;
}

function revenueMicroForSettlement(row: TokenPaySettlementRecord): {
  listMicro: bigint;
  effectiveMicro: bigint;
} {
  if (row.listUsdcMicro != null && row.listUsdcMicro > 0) {
    const list = BigInt(row.listUsdcMicro);
    const effective = BigInt(row.effectiveUsdcMicro ?? row.listUsdcMicro);
    return { listMicro: list, effectiveMicro: effective };
  }
  const merchant = getDefaultTokenPayMerchant();
  const list = priceUsdcForResource(row.resourceKind as X402ResourceKind);
  const effective = effectiveUsdcForTokenPay(list, merchant);
  return {
    listMicro: BigInt(Math.round(list * 1_000_000)),
    effectiveMicro: BigInt(Math.round(effective * 1_000_000)),
  };
}

function sumRevenueFromRecent(recent: TokenPaySettlementRecord[]): {
  listMicro: bigint;
  effectiveMicro: bigint;
} {
  return recent.reduce(
    (acc, row) => {
      const r = revenueMicroForSettlement(row);
      return {
        listMicro: acc.listMicro + r.listMicro,
        effectiveMicro: acc.effectiveMicro + r.effectiveMicro,
      };
    },
    { listMicro: 0n, effectiveMicro: 0n },
  );
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function weekTxLinksFromEnv(): { burnTx: string | null; lpTx: string | null } {
  const burnTx = (process.env.TCX_TRANSPARENCY_BURN_TX ?? "").trim() || null;
  const lpTx = (process.env.TCX_TRANSPARENCY_LP_TX ?? "").trim() || null;
  return { burnTx, lpTx };
}

function buildWeekLinks(burnTx: string | null, lpTx: string | null): TcxTransparencyLink[] {
  const links: TcxTransparencyLink[] = [];
  if (burnTx) links.push({ label: "burned", url: `https://solscan.io/tx/${burnTx}` });
  if (lpTx) links.push({ label: "add lp", url: `https://solscan.io/tx/${lpTx}` });
  return links;
}

function aggregatePeriod(
  daily: TokenPayDailyRollup[],
  recent: TokenPaySettlementRecord[],
  periodStart: string,
  periodEnd: string,
  decimals: number,
): {
  txCount: number;
  tcxReceived: number;
  revenueListUsdc: number;
  revenueUsdcEquivalent: number;
} {
  let txCount = 0;
  let volumeAtomic = 0n;
  let listMicro = 0n;
  let effectiveMicro = 0n;

  for (const row of daily) {
    if (!dateInRange(row.date, periodStart, periodEnd)) continue;
    txCount += row.txCount;
    volumeAtomic += BigInt(row.volumeAtomic || "0");
    listMicro += BigInt(row.listUsdcMicro ?? "0");
    effectiveMicro += BigInt(row.effectiveUsdcMicro ?? "0");
  }

  if (listMicro === 0n && txCount > 0) {
    for (const row of recent) {
      if (!dateInRange(utcDateStr(row.at), periodStart, periodEnd)) continue;
      const r = revenueMicroForSettlement(row);
      listMicro += r.listMicro;
      effectiveMicro += r.effectiveMicro;
    }
  }

  return {
    txCount,
    tcxReceived: atomicToUi(volumeAtomic, decimals),
    revenueListUsdc: microToUsd(listMicro),
    revenueUsdcEquivalent: microToUsd(effectiveMicro),
  };
}

export async function buildTcxTransparencyPayload(origin: string): Promise<TcxTransparencyPayload> {
  const launchDate = launchDateFromEnv();
  const merchantId = merchantIdFromEnv();
  const launchMs = parseUtcDate(launchDate);
  const nowMs = Date.now();
  const daysSinceLaunch = Math.min(
    90,
    Math.max(1, Math.ceil((nowMs - launchMs) / MS_DAY) + 1),
  );

  const analytics = await getTokenPayMerchantAnalytics(merchantId, daysSinceLaunch);
  const merchant = getDefaultTokenPayMerchant();
  const mint = analytics?.mint ?? merchant.mint ?? "";
  const decimals = merchant.decimals ?? 6;
  const recent = analytics?.recent ?? [];

  let totalsListMicro = BigInt(analytics?.listUsdcMicro ?? "0");
  let totalsEffectiveMicro = BigInt(analytics?.effectiveUsdcMicro ?? "0");
  if (totalsEffectiveMicro === 0n && (analytics?.txCount ?? 0) > 0) {
    const backfill = sumRevenueFromRecent(recent);
    totalsListMicro = backfill.listMicro;
    totalsEffectiveMicro = backfill.effectiveMicro;
  }

  const tcxReceived = atomicToUi(BigInt(analytics?.volumeAtomic ?? "0"), decimals);
  const revenueUsdcEquivalent = microToUsd(totalsEffectiveMicro);
  const revenueListUsdc = microToUsd(totalsListMicro);
  const tcxTxCount = analytics?.txCount ?? 0;

  const weeks: TcxTransparencyWeek[] = [];
  let periodStart = launchDate;
  const today = utcDateStr(nowMs);
  const envTx = weekTxLinksFromEnv();

  while (parseUtcDate(periodStart) <= nowMs) {
    const periodEnd = addUtcDays(periodStart, WEEK_DAYS - 1);
    const recapPublish = addUtcDays(periodEnd, 1);
    const inProgress = today <= periodEnd;
    const period = aggregatePeriod(analytics?.daily ?? [], recent, periodStart, periodEnd, decimals);
    const usdcNet = 0;
    const buybackBudget = usdcNet * BUYBACK_BUDGET_PCT;
    const buybackUsd = buybackBudget >= BUYBACK_MIN_USD ? buybackBudget : 0;

    weeks.push({
      weekEnd: periodEnd,
      periodStart,
      periodEnd,
      status: inProgress ? "in_progress" : "published",
      recapPublish,
      netUsd: usdcNet,
      revenueUsdcEquivalent: period.revenueUsdcEquivalent,
      revenueListUsdc: period.revenueListUsdc,
      buybackUsd,
      ...(buybackUsd === 0 && period.revenueUsdcEquivalent > 0
        ? { buybackNote: "Below $40 weekly threshold — rolls forward" }
        : {}),
      tcxReceived: period.tcxReceived,
      tcxBurned: period.tcxReceived * TCX_BURN_PCT,
      lpUsd: 0,
      txCount: period.txCount,
      links: buildWeekLinks(envTx.burnTx, envTx.lpTx),
    });

    periodStart = addUtcDays(periodStart, WEEK_DAYS);
    if (weeks.length > 52) break;
  }

  weeks.reverse();

  const activeWeek = weeks.find((w) => w.status === "in_progress");
  const snapshotNote = activeWeek
    ? `Week in progress (${activeWeek.periodStart}–${activeWeek.periodEnd} UTC). Full recap ${activeWeek.recapPublish} (Mon UTC). Auto-refreshes hourly.`
    : "Auto-refreshes hourly from Token Pay analytics.";

  const base: TcxTransparencyPayload = {
    version: 1,
    source: "live",
    launchDate,
    mint,
    cadence: {
      weekLengthDays: WEEK_DAYS,
      anchor: "launch",
      publishDay: "monday",
      timezone: "UTC",
      refreshSeconds: 3600,
      note: "Each 7-day period starts on launch day. Full recap publishes the following Monday (UTC).",
    },
    snapshotAt: new Date().toISOString(),
    snapshotNote,
    totals: {
      revenueUsdcEquivalent,
      revenueListUsdc,
      usdcNet: 0,
      tcxReceived,
      tcxBurned: tcxReceived * TCX_BURN_PCT,
      txCount: tcxTxCount,
      usdcTxCount: 0,
      tcxTxCount,
    },
    weeks,
    links: {
      analytics: `${origin}/api/token-pay-analytics?merchant=${encodeURIComponent(merchantId)}`,
      transparencyApi: `${origin}/api/tcx-transparency`,
    },
  };

  const override = parseOverride();
  if (!override) return base;

  return {
    ...base,
    ...override,
    source: "override",
    totals: { ...base.totals, ...(override.totals ?? {}) },
    weeks: override.weeks ?? base.weeks,
    cadence: { ...base.cadence, ...(override.cadence ?? {}) },
  };
}
