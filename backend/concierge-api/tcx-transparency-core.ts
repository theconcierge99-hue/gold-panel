/**
 * Live TCX transparency payload — aggregates Token Pay analytics into weekly ledger rows.
 */
import {
  getTokenPayMerchantAnalytics,
  type TokenPayDailyRollup,
  type TokenPayMerchantAnalytics,
  type TokenPaySettlementRecord,
} from "./token-pay/analytics-store";
import { SOON_MERCHANT_ID } from "./token-pay/merchants/soon";
import { effectiveUsdcForTokenPay } from "./token-pay/x402";
import { getDefaultTokenPayMerchant } from "./token-pay/registry";
import { priceUsdcForResource, type X402ResourceKind } from "./x402-pricing";
import { solanaRpcParallelRace } from "./x402-solana-rpc";
import {
  listTcxWeekLedgerTx,
  tcxBurnSignatures,
  type TcxWeekLedgerTx,
} from "./tcx-ledger-store";

const BUYBACK_MIN_USD = 40;
const BUYBACK_BUDGET_PCT = 0.15;
const WEEK_DAYS = 7;
const MS_DAY = 86_400_000;
const ON_CHAIN_CHECK_MS = 3_000;

type SignatureStatusResult = {
  value?: Array<{ err?: unknown; confirmationStatus?: string } | null>;
};

type ParsedBurnTransaction = {
  meta?: { err?: unknown };
  transaction?: {
    message?: {
      instructions?: Array<{
        parsed?: {
          type?: string;
          info?: {
            mint?: string;
            tokenAmount?: { amount?: string; decimals?: number };
          };
        };
      }>;
    };
  };
};

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
  txs?: TcxWeekLedgerTx;
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
  const raw = (process.env.TCX_LAUNCH_DATE ?? "2026-07-09").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "2026-07-09";
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

function nonNegative(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

async function reconcileAnalyticsOnChain(
  analytics: TokenPayMerchantAnalytics | null,
): Promise<{ analytics: TokenPayMerchantAnalytics | null; removed: number }> {
  if (!analytics?.recent.length) return { analytics, removed: 0 };

  const signatures = [...new Set(analytics.recent.map((row) => row.tx).filter(Boolean))];
  const status = await solanaRpcParallelRace<SignatureStatusResult>(
    "getSignatureStatuses",
    [signatures, { searchTransactionHistory: true }],
    ON_CHAIN_CHECK_MS,
  );
  if (!status.ok || !Array.isArray(status.result.value)) {
    return { analytics, removed: 0 };
  }

  const invalid = new Set<string>();
  signatures.forEach((signature, index) => {
    const row = status.result.value?.[index];
    if (!row || row.err) invalid.add(signature);
  });
  if (!invalid.size) return { analytics, removed: 0 };

  const removedRows = analytics.recent.filter((row) => invalid.has(row.tx));
  let removedVolume = 0n;
  let removedList = 0n;
  let removedEffective = 0n;
  const removedByDate = new Map<
    string,
    { count: number; volume: bigint; list: bigint; effective: bigint }
  >();

  for (const row of removedRows) {
    const amount = BigInt(row.amountAtomic || "0");
    const revenue = revenueMicroForSettlement(row);
    const date = utcDateStr(row.at);
    const day = removedByDate.get(date) ?? {
      count: 0,
      volume: 0n,
      list: 0n,
      effective: 0n,
    };
    day.count += 1;
    day.volume += amount;
    day.list += revenue.listMicro;
    day.effective += revenue.effectiveMicro;
    removedByDate.set(date, day);
    removedVolume += amount;
    removedList += revenue.listMicro;
    removedEffective += revenue.effectiveMicro;
  }

  const daily = analytics.daily.map((row) => {
    const removed = removedByDate.get(row.date);
    if (!removed) return row;
    return {
      ...row,
      txCount: Math.max(0, row.txCount - removed.count),
      volumeAtomic: nonNegative(BigInt(row.volumeAtomic || "0") - removed.volume).toString(),
      listUsdcMicro: nonNegative(BigInt(row.listUsdcMicro ?? "0") - removed.list).toString(),
      effectiveUsdcMicro: nonNegative(
        BigInt(row.effectiveUsdcMicro ?? "0") - removed.effective,
      ).toString(),
    };
  });

  return {
    removed: removedRows.length,
    analytics: {
      ...analytics,
      txCount: Math.max(0, analytics.txCount - removedRows.length),
      volumeAtomic: nonNegative(BigInt(analytics.volumeAtomic || "0") - removedVolume).toString(),
      listUsdcMicro: nonNegative(
        BigInt(analytics.listUsdcMicro || "0") - removedList,
      ).toString(),
      effectiveUsdcMicro: nonNegative(
        BigInt(analytics.effectiveUsdcMicro || "0") - removedEffective,
      ).toString(),
      daily,
      recent: analytics.recent.filter((row) => !invalid.has(row.tx)),
    },
  };
}

async function burnAmountFromTransaction(signature: string, mint: string): Promise<number> {
  const opts = {
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 1,
    commitment: "confirmed",
  };
  const tx = await solanaRpcParallelRace<ParsedBurnTransaction | null>(
    "getTransaction",
    [signature, opts],
    ON_CHAIN_CHECK_MS,
  );
  if (!tx.ok || !tx.result || tx.result.meta?.err) return 0;
  for (const instruction of tx.result.transaction?.message?.instructions ?? []) {
    const parsed = instruction.parsed;
    if (parsed?.type !== "burnChecked" || parsed.info?.mint !== mint) continue;
    const amount = BigInt(parsed.info.tokenAmount?.amount ?? "0");
    const decimals = parsed.info.tokenAmount?.decimals ?? 6;
    return atomicToUi(amount, decimals);
  }
  return 0;
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function formatTcxAmount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function weekTxsFromLedger(stored: TcxWeekLedgerTx | undefined): TcxWeekLedgerTx | undefined {
  if (!stored) return undefined;
  if (
    !stored.netUsdcTx &&
    !stored.buybackTx &&
    !tcxBurnSignatures(stored.tcxBurnTx).length &&
    !stored.lpTx
  ) {
    return undefined;
  }
  return { ...stored };
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

  const rawAnalytics = await getTokenPayMerchantAnalytics(merchantId, daysSinceLaunch);
  const reconciled = await reconcileAnalyticsOnChain(rawAnalytics);
  const analytics = reconciled.analytics;
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
      tcxBurned: 0,
      lpUsd: 0,
      txCount: period.txCount,
    });

    periodStart = addUtcDays(periodStart, WEEK_DAYS);
    if (weeks.length > 52) break;
  }

  weeks.reverse();

  const ledgerByWeek = await listTcxWeekLedgerTx(weeks.map((w) => w.weekEnd));
  const burnAmounts = new Map<string, number>();
  await Promise.all(
    [...ledgerByWeek.entries()].map(async ([weekEnd, txs]) => {
      const sigs = tcxBurnSignatures(txs.tcxBurnTx);
      if (!sigs.length) return;
      const amounts = await Promise.all(sigs.map((sig) => burnAmountFromTransaction(sig, mint)));
      burnAmounts.set(
        weekEnd,
        amounts.reduce((sum, n) => sum + n, 0),
      );
    }),
  );
  let tcxBurned = 0;
  let unattributedBurn = 0;
  for (const week of weeks) {
    const stored = ledgerByWeek.get(week.weekEnd);
    const burned = burnAmounts.get(week.weekEnd) ?? 0;
    tcxBurned += burned;

    // A burn executed inside an open period settles the *previous* cycle's
    // treasury, not the revenue still accruing. Keep the row empty until the
    // period closes so "in progress" never reads as "already burned".
    if (week.status === "published") {
      const txs = weekTxsFromLedger(stored);
      if (txs) week.txs = txs;
      week.tcxBurned = burned;
    } else {
      const txs = weekTxsFromLedger(stored ? { ...stored, tcxBurnTx: undefined } : undefined);
      if (txs) week.txs = txs;
      week.tcxBurned = 0;
      unattributedBurn += burned;
    }
  }

  const activeWeek = weeks.find((w) => w.status === "in_progress");
  const noteParts = activeWeek
    ? [`Week in progress (${activeWeek.periodStart}–${activeWeek.periodEnd} UTC).`]
    : [];
  if (unattributedBurn > 0) {
    noteParts.push(
      `${formatTcxAmount(unattributedBurn)} TCX burned during the open period settles the prior cycle — counted in the launch total, attributed to a week once the period closes.`,
    );
  }
  if (reconciled.removed > 0) {
    noteParts.push(`${reconciled.removed} dropped settlement(s) excluded by on-chain verification.`);
  }
  const snapshotNote = noteParts.join(" ");

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
      note: "Each 7-day period starts on launch day. Full recap publishes the following Monday (UTC). TX links come from config/launch/tcx-week-ledger.json.",
    },
    snapshotAt: new Date().toISOString(),
    snapshotNote,
    totals: {
      revenueUsdcEquivalent,
      revenueListUsdc,
      usdcNet: 0,
      tcxReceived,
      tcxBurned,
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

  // The computed note carries derived facts (open period, unattributed burn,
  // dropped settlements). An operator note augments it rather than replacing
  // it, and punctuation-only placeholders are discarded.
  const overrideNote = (override.snapshotNote ?? "").trim();
  const mergedNote = [snapshotNote, /^[.\u2026\s]*$/.test(overrideNote) ? "" : overrideNote]
    .filter(Boolean)
    .join(" ");

  return {
    ...base,
    ...override,
    source: "override",
    snapshotNote: mergedNote,
    totals: { ...base.totals, ...(override.totals ?? {}) },
    weeks: override.weeks ?? base.weeks,
    cadence: { ...base.cadence, ...(override.cadence ?? {}) },
    links: { ...base.links, ...(override.links ?? {}) },
  };
}
