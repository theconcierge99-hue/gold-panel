/**
 * Concierge LP session store — KV / Upstash with in-memory fallback.
 */
export type ConciergeLpSessionStatus = "active" | "stopping" | "stopped" | "failed";

export type ConciergeLpCriteria = {
  minTvl: number;
  maxApy: number;
  minFeeTvl: number;
  minOrganicScore: number;
  takeProfitPct: number;
  oorMinutes: number;
  maxCapitalSol: number;
  binRange?: unknown;
};

export type ConciergeLpSessionRecord = {
  sessionId: string;
  ownerWallet: string;
  depositAddress: string;
  status: ConciergeLpSessionStatus;
  dryRun: boolean;
  criteria: ConciergeLpCriteria;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  stoppedAt?: string | null;
  payer?: string | null;
  lastWorkerView?: Record<string, unknown> | null;
  error?: string | null;
};

const KEY_PREFIX = "concierge:lp-session:";
const WALLET_PREFIX = "concierge:lp-wallet:";
const DEFAULT_TTL_SEC = 86_400;
const MAX_MEM = 200;
const memSessions = new Map<string, ConciergeLpSessionRecord>();
const memWalletActive = new Map<string, string>();

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function sessionKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

function walletKey(wallet: string): string {
  return `${WALLET_PREFIX}${wallet}`;
}

export function lpSessionTtlSec(): number {
  const raw = Number(process.env.CONCIERGE_LP_SESSION_TTL_SEC ?? DEFAULT_TTL_SEC);
  if (!Number.isFinite(raw) || raw < 600) return DEFAULT_TTL_SEC;
  return Math.min(Math.floor(raw), 7 * 86_400);
}

export function generateLpSessionId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `lp_${hex}`;
}

function pruneMem(): void {
  if (memSessions.size <= MAX_MEM) return;
  const now = Date.now();
  for (const [id, row] of memSessions) {
    if (Date.parse(row.expiresAt) < now) memSessions.delete(id);
  }
  while (memSessions.size > MAX_MEM) {
    const first = memSessions.keys().next().value;
    if (first == null) break;
    memSessions.delete(first);
  }
}

export async function putLpSession(row: ConciergeLpSessionRecord): Promise<void> {
  const ttl = lpSessionTtlSec();
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(sessionKey(row.sessionId), row, { ex: ttl });
    if (row.status === "active") {
      await kv.set(walletKey(row.ownerWallet), row.sessionId, { ex: ttl });
    }
    return;
  }
  pruneMem();
  memSessions.set(row.sessionId, row);
  if (row.status === "active") memWalletActive.set(row.ownerWallet, row.sessionId);
}

export async function getLpSession(sessionId: string): Promise<ConciergeLpSessionRecord | null> {
  if (!sessionId || !/^lp_[a-f0-9]{20}$/i.test(sessionId)) return null;
  if (hasRedis()) {
    const kv = await kvClient();
    const row = await kv.get<ConciergeLpSessionRecord>(sessionKey(sessionId));
    return row ?? null;
  }
  const row = memSessions.get(sessionId) ?? null;
  if (row && Date.parse(row.expiresAt) < Date.now()) {
    memSessions.delete(sessionId);
    return null;
  }
  return row;
}

export async function getActiveSessionIdForWallet(wallet: string): Promise<string | null> {
  if (!wallet) return null;
  if (hasRedis()) {
    const kv = await kvClient();
    const id = await kv.get<string>(walletKey(wallet));
    if (!id) return null;
    const row = await getLpSession(id);
    if (!row || row.status !== "active") return null;
    return id;
  }
  const id = memWalletActive.get(wallet) ?? null;
  if (!id) return null;
  const row = memSessions.get(id);
  if (!row || row.status !== "active") {
    memWalletActive.delete(wallet);
    return null;
  }
  return id;
}

export async function patchLpSession(
  sessionId: string,
  patch: Partial<ConciergeLpSessionRecord>,
): Promise<ConciergeLpSessionRecord | null> {
  const row = await getLpSession(sessionId);
  if (!row) return null;
  const next: ConciergeLpSessionRecord = {
    ...row,
    ...patch,
    sessionId: row.sessionId,
    updatedAt: new Date().toISOString(),
  };
  await putLpSession(next);
  if (next.status !== "active" && !hasRedis()) {
    memWalletActive.delete(next.ownerWallet);
  }
  if (next.status !== "active" && hasRedis()) {
    try {
      const kv = await kvClient();
      await kv.del(walletKey(next.ownerWallet));
    } catch {
      /* */
    }
  }
  return next;
}

export function publicLpSessionView(
  row: ConciergeLpSessionRecord,
  workerView?: Record<string, unknown> | null,
): Record<string, unknown> {
  const w = workerView || row.lastWorkerView || null;
  return {
    sessionId: row.sessionId,
    ownerWallet: row.ownerWallet,
    depositAddress: row.depositAddress,
    status: row.status,
    dryRun: row.dryRun,
    criteria: row.criteria,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stoppedAt: row.stoppedAt ?? null,
    error: row.error ?? null,
    decisions: w?.decisions ?? [],
    lessons: w?.lessons ?? [],
    positions: w?.positions ?? [],
    lastScreen: w?.lastScreen ?? null,
    lastError: w?.lastError ?? null,
    withdraw: w?.withdraw ?? null,
  };
}

export function defaultLpCriteria(raw: unknown): ConciergeLpCriteria {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    minTvl: num(o.minTvl, 50_000),
    maxApy: num(o.maxApy, 250),
    minFeeTvl: num(o.minFeeTvl, 0),
    minOrganicScore: num(o.minOrganicScore, 0),
    takeProfitPct: num(o.takeProfitPct, 5),
    oorMinutes: num(o.oorMinutes, 15),
    maxCapitalSol: num(o.maxCapitalSol, 0.5),
    binRange: o.binRange,
  };
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
