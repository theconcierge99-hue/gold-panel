/**
 * Persistent Lounge feed memory for Concierge — wire headlines + creator signals.
 * Stored in Upstash/KV; dev uses in-process map when Redis is unset.
 */
import type { NewsHeadline } from "./market-sources";
import type { CreatorSignal } from "./signals-types";

export type LoungeMemoryKind = "wire_headline" | "creator_signal";

export type LoungeMemoryItem = {
  id: string;
  kind: LoungeMemoryKind;
  title: string;
  summary: string;
  source: string;
  category: string;
  url?: string;
  signalId?: string;
  creatorWallet?: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

const MEMORY_INDEX_KEY = "lounge:memory:index";
const MAX_MEMORY_ITEMS = 400;
const MAX_INGEST_BATCH = 48;
const MAX_PROMPT_ITEMS = 18;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "what",
  "when",
  "your",
  "about",
  "have",
  "are",
  "was",
  "how",
  "can",
  "you",
  "any",
]);

const devMemory = new Map<string, LoungeMemoryItem>();
const devIndex: string[] = [];

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function memoryItemKey(id: string): string {
  return `lounge:memory:item:${id}`;
}

function hashStable(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function wireMemoryId(h: NewsHeadline): string {
  const key = `${h.source}|${h.title}|${h.url ?? ""}`;
  return `wh_${hashStable(key)}`;
}

function tokenizeQuery(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ];
}

async function readMemoryIndex(): Promise<string[]> {
  if (hasRedis()) {
    const kv = await kvClient();
    const ids = await kv.get<string[]>(MEMORY_INDEX_KEY);
    return Array.isArray(ids) ? ids : [];
  }
  return [...devIndex];
}

async function writeMemoryIndex(ids: string[]): Promise<void> {
  const trimmed = ids.slice(0, MAX_MEMORY_ITEMS);
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(MEMORY_INDEX_KEY, trimmed);
    return;
  }
  devIndex.length = 0;
  devIndex.push(...trimmed);
  const keep = new Set(trimmed);
  for (const id of [...devMemory.keys()]) {
    if (!keep.has(id)) devMemory.delete(id);
  }
}

async function getMemoryItem(id: string): Promise<LoungeMemoryItem | null> {
  if (hasRedis()) {
    const kv = await kvClient();
    return (await kv.get<LoungeMemoryItem>(memoryItemKey(id))) ?? null;
  }
  return devMemory.get(id) ?? null;
}

async function upsertMemoryItem(item: LoungeMemoryItem): Promise<void> {
  const existing = await getMemoryItem(item.id);
  const merged: LoungeMemoryItem = existing
    ? {
        ...existing,
        ...item,
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        summary: item.summary || existing.summary,
      }
    : item;

  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(memoryItemKey(item.id), merged);
    const ids = await readMemoryIndex();
    const next = [item.id, ...ids.filter((x) => x !== item.id)].slice(0, MAX_MEMORY_ITEMS);
    await kv.set(MEMORY_INDEX_KEY, next);
    return;
  }

  devMemory.set(item.id, merged);
  const next = [item.id, ...devIndex.filter((x) => x !== item.id)].slice(0, MAX_MEMORY_ITEMS);
  await writeMemoryIndex(next);
}

export async function ingestWireHeadlines(headlines: NewsHeadline[]): Promise<number> {
  const batch = headlines.slice(0, MAX_INGEST_BATCH);
  const now = new Date().toISOString();
  let n = 0;
  for (const h of batch) {
    const title = (h.title ?? "").trim();
    if (title.length < 8) continue;
    const id = wireMemoryId(h);
    await upsertMemoryItem({
      id,
      kind: "wire_headline",
      title,
      summary: (h.summary ?? "").trim().slice(0, 600),
      source: (h.source ?? "Wire").trim(),
      category: "Markets",
      url: h.url,
      firstSeenAt: now,
      lastSeenAt: now,
    });
    n++;
  }
  return n;
}

export async function ingestCreatorSignalMemory(signal: CreatorSignal): Promise<void> {
  const now = new Date().toISOString();
  const primaryCat = signal.categories[0] ?? "Other";
  await upsertMemoryItem({
    id: `cs_${signal.id}`,
    kind: "creator_signal",
    title: signal.title,
    summary: signal.summary.slice(0, 2000),
    source: "Lounge Signal",
    category: primaryCat,
    signalId: signal.id,
    creatorWallet: signal.creatorWallet,
    firstSeenAt: signal.publishedAt || now,
    lastSeenAt: now,
  });
}

async function listRecentMemoryItems(limit = 220): Promise<LoungeMemoryItem[]> {
  const ids = (await readMemoryIndex()).slice(0, limit);
  const out: LoungeMemoryItem[] = [];
  for (const id of ids) {
    const item = await getMemoryItem(id);
    if (item) out.push(item);
  }
  return out;
}

function scoreItem(item: LoungeMemoryItem, tokens: string[]): number {
  if (!tokens.length) return 0;
  const blob = `${item.title} ${item.summary} ${item.source} ${item.category}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (blob.includes(t)) score += t.length >= 5 ? 3 : 2;
  }
  if (item.kind === "creator_signal") score += 1;
  const ageH = (Date.now() - new Date(item.lastSeenAt).getTime()) / 3_600_000;
  if (ageH < 24) score += 2;
  else if (ageH < 72) score += 1;
  return score;
}

export async function selectRelevantLoungeMemory(
  userMessage: string,
  limit = MAX_PROMPT_ITEMS,
): Promise<LoungeMemoryItem[]> {
  const items = await listRecentMemoryItems();
  if (!items.length) return [];

  const tokens = tokenizeQuery(userMessage);
  const scored = items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .sort((a, b) => b.score - a.score || b.item.lastSeenAt.localeCompare(a.item.lastSeenAt));

  const withHits = scored.filter((s) => s.score > 0).slice(0, limit);
  if (withHits.length >= 6) return withHits.map((s) => s.item);

  return scored.slice(0, Math.min(limit, 10)).map((s) => s.item);
}

export function formatLoungeMemoryForPrompt(items: LoungeMemoryItem[]): string {
  if (!items.length) return "";

  const lines = items.map((item) => {
    const kind = item.kind === "creator_signal" ? "Creator signal" : "Wire";
    const url = item.url ? ` · ${item.url}` : item.signalId ? ` · signal:${item.signalId}` : "";
    const sum = item.summary
      ? `\n  Summary: ${item.summary.slice(0, 420)}${item.summary.length > 420 ? "…" : ""}`
      : "";
    return `- [${kind} | ${item.source} | ${item.category} | seen ${item.lastSeenAt.slice(0, 10)}] ${item.title}${url}${sum}`;
  });

  return `LOUNGE MEMORY (persisted items that appeared on the Executive Lounge feed — use for continuity; cite title/source when relevant):
${lines.join("\n")}`;
}

export async function buildLoungeMemoryContextBlock(userMessage: string): Promise<string> {
  try {
    const picked = await selectRelevantLoungeMemory(userMessage);
    return formatLoungeMemoryForPrompt(picked);
  } catch (e) {
    console.error("[lounge-memory] retrieve", e instanceof Error ? e.message : e);
    return "";
  }
}

/** Non-blocking ingest from live market snapshot (Concierge + /api/market). */
export function ingestWireHeadlinesAsync(headlines: NewsHeadline[]): void {
  void ingestWireHeadlines(headlines).catch((e) => {
    console.error("[lounge-memory] ingest wire", e instanceof Error ? e.message : e);
  });
}
