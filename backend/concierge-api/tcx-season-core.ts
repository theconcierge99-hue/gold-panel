/**
 * TCX Season scoring — Hold + Use window from start date until snapshot H.
 */
import {
  getSoonBalanceAtomic,
  getSoonDecimals,
  resolveSoonTier,
  type SoonTier,
} from "./soon-token";
import { SOON_MERCHANT_ID } from "./token-pay/merchants/soon";
import {
  getSeasonPayer,
  listSeasonPayers,
  type SeasonPayerRow,
} from "./tcx-season-store";

const MS_DAY = 86_400_000;
const DEFAULT_START = "2026-07-16";
const OWNER_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type SeasonConfig = {
  startDate: string;
  startMs: number;
  snapshotAt: string | null;
  snapshotMs: number | null;
  minCalls: number;
  callCap: number;
  minHoldDays: number;
  rewardPoolNote: string;
  merchantId: string;
};

export type SeasonStatus = "in_progress" | "snapshot_ready";

function parseUtcDayStart(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

function parseSnapshotAt(raw: string): { iso: string; ms: number } | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const ms = parseUtcDayStart(t);
    if (ms === null) return null;
    return { iso: `${t}T00:00:00.000Z`, ms };
  }
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

export function getSeasonConfig(): SeasonConfig {
  const startRaw = (process.env.TCX_SEASON_START ?? DEFAULT_START).trim() || DEFAULT_START;
  const startMs = parseUtcDayStart(startRaw) ?? parseUtcDayStart(DEFAULT_START)!;

  const snapRaw = (process.env.TCX_SEASON_SNAPSHOT_AT ?? "").trim();
  const snap = snapRaw ? parseSnapshotAt(snapRaw) : null;

  const minCalls = Math.min(Math.max(Number(process.env.TCX_SEASON_MIN_CALLS ?? "3") || 3, 1), 100);
  const callCap = Math.min(Math.max(Number(process.env.TCX_SEASON_CALL_CAP ?? "20") || 20, 1), 500);
  const minHoldDays = Math.min(
    Math.max(Number(process.env.TCX_SEASON_MIN_HOLD_DAYS ?? "7") || 7, 0),
    90,
  );

  return {
    startDate: startRaw.length === 10 ? startRaw : DEFAULT_START,
    startMs,
    snapshotAt: snap?.iso ?? null,
    snapshotMs: snap?.ms ?? null,
    minCalls,
    callCap,
    minHoldDays,
    rewardPoolNote: "10M+ TCX community rewards — same-day drop at snapshot",
    merchantId: SOON_MERCHANT_ID,
  };
}

export function seasonStatus(cfg: SeasonConfig, nowMs = Date.now()): SeasonStatus {
  if (cfg.snapshotMs !== null && nowMs >= cfg.snapshotMs) return "snapshot_ready";
  return "in_progress";
}

export function isInSeasonWindow(atMs: number, cfg: SeasonConfig = getSeasonConfig()): boolean {
  if (atMs < cfg.startMs) return false;
  if (cfg.snapshotMs !== null && atMs > cfg.snapshotMs) return false;
  return true;
}

function tierWeight(tier: SoonTier | null): number {
  if (!tier) return 0;
  if (tier.id === "president") return 3;
  if (tier.id === "executive") return 2;
  if (tier.id === "deluxe") return 1;
  return 0;
}

function balanceUiFromAtomic(balanceAtomic: bigint, decimals: number): number {
  const div = 10 ** decimals;
  return Number(balanceAtomic) / div;
}

export type SeasonEligibility = {
  eligible: boolean;
  reasons: string[];
  paidCallsOk: boolean;
  holdOk: boolean;
  holdDaysOk: boolean;
  paidCalls: number;
  minCalls: number;
  holdDays: number | null;
  minHoldDays: number;
  firstAt: number | null;
  checkAt: number;
};

export type SeasonWalletScore = {
  wallet: string;
  paidCalls: number;
  volumeAtomic: string;
  firstAt: number | null;
  lastAt: number | null;
  lastTx: string | null;
  resourceKinds: string[];
  balanceUi: number | null;
  tier: { id: string; label: string; minHold: number } | null;
  tierWeight: number;
  callPoints: number;
  points: number;
  eligibility: SeasonEligibility;
};

export function scoreSeasonWallet(input: {
  wallet: string;
  row: SeasonPayerRow | null;
  balanceUi: number | null;
  cfg?: SeasonConfig;
  nowMs?: number;
}): SeasonWalletScore {
  const cfg = input.cfg ?? getSeasonConfig();
  const nowMs = input.nowMs ?? Date.now();
  const checkAt = cfg.snapshotMs !== null ? Math.min(nowMs, cfg.snapshotMs) : nowMs;
  const row = input.row;
  const paidCalls = row?.paidCalls ?? 0;
  const tier = input.balanceUi !== null ? resolveSoonTier(input.balanceUi) : null;
  const tw = tierWeight(tier);
  const callPoints = Math.min(paidCalls, cfg.callCap);
  const paidCallsOk = paidCalls >= cfg.minCalls;
  const holdOk = tw > 0;

  let holdDays: number | null = null;
  let holdDaysOk = cfg.minHoldDays <= 0;
  if (row && row.paidCalls > 0 && row.firstAt > 0) {
    holdDays = Math.floor((checkAt - row.firstAt) / MS_DAY);
    holdDaysOk = holdDays >= cfg.minHoldDays;
  }

  const reasons: string[] = [];
  if (!paidCallsOk) {
    reasons.push(`Need ≥${cfg.minCalls} TCX paid calls in Season window (have ${paidCalls})`);
  }
  if (!holdOk) {
    reasons.push("Need Deluxe+ TCX balance at check time (≥ 1,000,000)");
  }
  if (paidCalls > 0 && !holdDaysOk) {
    reasons.push(
      `First Season payment must be ≥${cfg.minHoldDays} days before snapshot/check (have ${holdDays ?? 0})`,
    );
  }
  if (paidCalls === 0) {
    reasons.push("No Season TCX payments recorded yet (window starts Season start UTC)");
  }

  const eligible = paidCallsOk && holdOk && holdDaysOk;
  const points = eligible ? tw + callPoints : 0;

  return {
    wallet: input.wallet,
    paidCalls,
    volumeAtomic: row?.volumeAtomic ?? "0",
    firstAt: row && row.paidCalls > 0 ? row.firstAt : null,
    lastAt: row && row.paidCalls > 0 ? row.lastAt : null,
    lastTx: row && row.lastTx ? row.lastTx : null,
    resourceKinds: row?.resourceKinds ?? [],
    balanceUi: input.balanceUi,
    tier: tier ? { id: tier.id, label: tier.label, minHold: tier.minHold } : null,
    tierWeight: tw,
    callPoints: eligible ? callPoints : Math.min(paidCalls, cfg.callCap),
    points,
    eligibility: {
      eligible,
      reasons,
      paidCallsOk,
      holdOk,
      holdDaysOk,
      paidCalls,
      minCalls: cfg.minCalls,
      holdDays,
      minHoldDays: cfg.minHoldDays,
      firstAt: row && row.paidCalls > 0 ? row.firstAt : null,
      checkAt,
    },
  };
}

export async function buildSeasonWalletPayload(
  wallet: string,
  cfg: SeasonConfig = getSeasonConfig(),
): Promise<{ ok: true; score: SeasonWalletScore } | { ok: false; code: string; error: string }> {
  const w = wallet.trim();
  if (!OWNER_RE.test(w)) {
    return { ok: false, code: "invalid_wallet", error: "Invalid Solana wallet" };
  }

  const row = await getSeasonPayer(cfg.merchantId, w);
  const decimals = getSoonDecimals();
  let balanceUi: number | null = null;
  try {
    const atomic = await getSoonBalanceAtomic(w);
    if (atomic !== null) balanceUi = balanceUiFromAtomic(atomic, decimals);
  } catch {
    balanceUi = null;
  }

  return {
    ok: true,
    score: scoreSeasonWallet({ wallet: w, row, balanceUi, cfg }),
  };
}

export async function buildSeasonLeaderboard(
  limit: number,
  cfg: SeasonConfig = getSeasonConfig(),
): Promise<SeasonWalletScore[]> {
  const cap = Math.min(Math.max(limit, 1), 100);
  const payers = await listSeasonPayers(cfg.merchantId);
  const decimals = getSoonDecimals();
  const scored: SeasonWalletScore[] = [];

  for (const { wallet, row } of payers) {
    let balanceUi: number | null = null;
    try {
      const atomic = await getSoonBalanceAtomic(wallet);
      if (atomic !== null) balanceUi = balanceUiFromAtomic(atomic, decimals);
    } catch {
      balanceUi = null;
    }
    scored.push(scoreSeasonWallet({ wallet, row, balanceUi, cfg }));
  }

  scored.sort((a, b) => b.points - a.points || b.paidCalls - a.paidCalls);
  return scored.slice(0, cap);
}

export async function buildSeasonSummaryPayload(origin: string) {
  const cfg = getSeasonConfig();
  const status = seasonStatus(cfg);
  const payers = await listSeasonPayers(cfg.merchantId);
  let totalPaidCalls = 0;
  for (const { row } of payers) totalPaidCalls += row.paidCalls;

  return {
    version: 1,
    season: "tcx-season-2026",
    status,
    config: {
      startDate: cfg.startDate,
      snapshotAt: cfg.snapshotAt,
      minCalls: cfg.minCalls,
      callCap: cfg.callCap,
      minHoldDays: cfg.minHoldDays,
      rewardPoolNote: cfg.rewardPoolNote,
      points: "tierWeight (Deluxe 1 / Executive 2 / President 3) + min(paidCalls, callCap)",
    },
    totals: {
      wallets: payers.length,
      paidCalls: totalPaidCalls,
    },
    links: {
      seasonApi: `${origin}/api/tcx-season`,
      walletExample: `${origin}/api/tcx-season?wallet=`,
      leaderboard: `${origin}/api/tcx-season?leaderboard=1&limit=50`,
      desk: origin,
      transparency: `${origin}/token/transparency`,
    },
    note:
      status === "in_progress"
        ? "Season in progress — points accrue from startDate until snapshotAt (set TCX_SEASON_SNAPSHOT_AT when H is announced)."
        : "Snapshot moment reached — use wallet/leaderboard for final eligibility preview (hold checked live).",
  };
}
