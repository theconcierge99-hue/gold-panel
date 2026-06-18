/**
 * Verdict accuracy leaderboard — records intel-verdict snapshots and scores 24h BTC alignment.
 */
import type { DeskVerdict } from "./concierge-defi-intel";

const SNAPSHOTS_KEY = "intel:verdict:snapshots";
const MAX_SNAPSHOTS = 120;
const EVAL_AFTER_MS = 24 * 60 * 60 * 1000;

export type VerdictSnapshot = {
  id: string;
  recordedAt: string;
  signal: DeskVerdict["signal"];
  confidence: DeskVerdict["confidence"];
  headline: string;
  btcUsd: number | null;
  evaluatedAt?: string;
  btcChange24hPct?: number | null;
  hit?: boolean | null;
};

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

const devSnapshots: VerdictSnapshot[] = [];

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

async function readSnapshots(): Promise<VerdictSnapshot[]> {
  if (hasRedis()) {
    const kv = await kvClient();
    const rows = await kv.get<VerdictSnapshot[]>(SNAPSHOTS_KEY);
    return Array.isArray(rows) ? rows : [];
  }
  return [...devSnapshots];
}

async function writeSnapshots(rows: VerdictSnapshot[]): Promise<void> {
  const trimmed = rows.slice(-MAX_SNAPSHOTS);
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(SNAPSHOTS_KEY, trimmed);
    return;
  }
  devSnapshots.length = 0;
  devSnapshots.push(...trimmed);
}

function snapshotId(): string {
  return `vs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function scoreHit(signal: DeskVerdict["signal"], btcChangePct: number): boolean | null {
  if (!Number.isFinite(btcChangePct)) return null;
  if (signal === "snipe" || signal === "follow") return btcChangePct >= 1;
  if (signal === "avoid") return btcChangePct <= -1;
  if (signal === "watch" || signal === "rebalance") return Math.abs(btcChangePct) < 2;
  return null;
}

async function fetchBtcUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { price?: string };
    const n = Number(data.price);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function recordVerdictSnapshot(input: {
  verdict: DeskVerdict;
  btcUsd: number | null;
}): Promise<void> {
  try {
    const rows = await readSnapshots();
    rows.push({
      id: snapshotId(),
      recordedAt: new Date().toISOString(),
      signal: input.verdict.signal,
      confidence: input.verdict.confidence,
      headline: input.verdict.headline.slice(0, 240),
      btcUsd: input.btcUsd,
    });
    await writeSnapshots(rows);
  } catch {
    /* non-blocking */
  }
}

async function evaluatePending(rows: VerdictSnapshot[]): Promise<VerdictSnapshot[]> {
  const now = Date.now();
  const btcNow = await fetchBtcUsd();
  let changed = false;

  const updated = rows.map((row) => {
    if (row.evaluatedAt || row.btcUsd == null || btcNow == null) return row;
    const age = now - new Date(row.recordedAt).getTime();
    if (age < EVAL_AFTER_MS) return row;

    const btcChange24hPct = ((btcNow - row.btcUsd) / row.btcUsd) * 100;
    const hit = scoreHit(row.signal, btcChange24hPct);
    changed = true;
    return {
      ...row,
      evaluatedAt: new Date().toISOString(),
      btcChange24hPct: Math.round(btcChange24hPct * 100) / 100,
      hit,
    };
  });

  if (changed) await writeSnapshots(updated);
  return updated;
}

export async function getVerdictAccuracyLeaderboard(): Promise<{
  ok: true;
  dataAsOf: string;
  methodology: string;
  evaluated: {
    total: number;
    hits: number;
    misses: number;
    inconclusive: number;
    hitRatePct: number | null;
  };
  bySignal: Record<string, { total: number; hits: number; hitRatePct: number | null }>;
  recent: VerdictSnapshot[];
}> {
  const rows = await evaluatePending(await readSnapshots());
  const evaluated = rows.filter((r) => r.evaluatedAt && r.hit !== null && r.hit !== undefined);

  let hits = 0;
  let misses = 0;
  let inconclusive = 0;
  const bySignal: Record<string, { total: number; hits: number }> = {};

  for (const row of evaluated) {
    const sig = row.signal;
    if (!bySignal[sig]) bySignal[sig] = { total: 0, hits: 0 };
    bySignal[sig].total += 1;
    if (row.hit === true) {
      hits += 1;
      bySignal[sig].hits += 1;
    } else if (row.hit === false) {
      misses += 1;
    } else {
      inconclusive += 1;
    }
  }

  const total = hits + misses;
  const bySignalOut: Record<string, { total: number; hits: number; hitRatePct: number | null }> =
    {};
  for (const [sig, stats] of Object.entries(bySignal)) {
    bySignalOut[sig] = {
      ...stats,
      hitRatePct: stats.total ? Math.round((stats.hits / stats.total) * 1000) / 10 : null,
    };
  }

  return {
    ok: true,
    dataAsOf: new Date().toISOString(),
    methodology:
      "Each paid intel-verdict records BTC mark + signal. After 24h, hit if snipe/follow + BTC ≥+1%, avoid + BTC ≤−1%, watch/rebalance if |move| <2%. Social proof — not financial advice.",
    evaluated: {
      total,
      hits,
      misses,
      inconclusive,
      hitRatePct: total ? Math.round((hits / total) * 1000) / 10 : null,
    },
    bySignal: bySignalOut,
    recent: rows.slice(-15).reverse(),
  };
}
