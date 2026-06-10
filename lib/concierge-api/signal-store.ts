import type { CreatorSignal, SignalLedgerEntry } from "./signals-types";

const SIGNALS_INDEX_KEY = "lounge:signals:index";
const LEDGER_KEY = "lounge:signals:ledger";
const MAX_SIGNALS = 120;
const MAX_LEDGER = 5000;

const devSignals: CreatorSignal[] = [];
const devLedger: SignalLedgerEntry[] = [];

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

async function readIndex(): Promise<string[]> {
  if (hasRedis()) {
    const kv = await kvClient();
    const ids = await kv.get<string[]>(SIGNALS_INDEX_KEY);
    return Array.isArray(ids) ? ids : [];
  }
  return devSignals.map((s) => s.id);
}

async function writeIndex(ids: string[]): Promise<void> {
  const trimmed = ids.slice(0, MAX_SIGNALS);
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(SIGNALS_INDEX_KEY, trimmed);
    return;
  }
  const keep = new Set(trimmed);
  while (devSignals.length) {
    const last = devSignals[devSignals.length - 1];
    if (keep.has(last.id)) break;
    devSignals.pop();
  }
}

function signalKey(id: string): string {
  return `lounge:signal:${id}`;
}

export async function getSignalById(id: string): Promise<CreatorSignal | null> {
  const sid = id.trim();
  if (!sid) return null;
  if (hasRedis()) {
    const kv = await kvClient();
    return (await kv.get<CreatorSignal>(signalKey(sid))) ?? null;
  }
  return devSignals.find((s) => s.id === sid) ?? null;
}

export async function savePublishedSignal(signal: CreatorSignal): Promise<void> {
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(signalKey(signal.id), signal);
    const ids = await readIndex();
    const next = [signal.id, ...ids.filter((x) => x !== signal.id)].slice(0, MAX_SIGNALS);
    await kv.set(SIGNALS_INDEX_KEY, next);
    return;
  }
  const idx = devSignals.findIndex((s) => s.id === signal.id);
  if (idx >= 0) devSignals[idx] = signal;
  else devSignals.unshift(signal);
  if (devSignals.length > MAX_SIGNALS) devSignals.length = MAX_SIGNALS;
}

export async function listPublishedSignals(limit = 40): Promise<CreatorSignal[]> {
  const ids = (await readIndex()).slice(0, limit);
  const out: CreatorSignal[] = [];
  for (const id of ids) {
    const s = await getSignalById(id);
    if (s) out.push(s);
  }
  return out;
}

export async function appendUnlockLedger(entry: SignalLedgerEntry): Promise<void> {
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.lpush(LEDGER_KEY, entry);
    await kv.ltrim(LEDGER_KEY, 0, MAX_LEDGER - 1);
    return;
  }
  devLedger.unshift(entry);
  if (devLedger.length > MAX_LEDGER) devLedger.length = MAX_LEDGER;
}

export function signalStoreReady(): boolean {
  return hasRedis() || process.env.VERCEL_ENV !== "production";
}

export function signalStoreMode(): "redis" | "memory" {
  return hasRedis() ? "redis" : "memory";
}
