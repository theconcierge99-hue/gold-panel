/**
 * Edge-isolate in-memory cache for read-heavy public API routes (Hobby CPU relief).
 * Per-isolate only — does not change response bodies or auth/settlement behavior.
 */

type CacheEntry = { at: number; value: unknown };

const stores = new Map<string, Map<string, CacheEntry>>();
const MAX_ENTRIES_PER_NS = 48;

function bucketFor(ns: string): Map<string, CacheEntry> {
  let bucket = stores.get(ns);
  if (!bucket) {
    bucket = new Map();
    stores.set(ns, bucket);
  }
  return bucket;
}

export function getEdgeCache<T>(ns: string, key: string, maxAgeMs: number): T | null {
  const hit = bucketFor(ns).get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) {
    bucketFor(ns).delete(key);
    return null;
  }
  return hit.value as T;
}

export function setEdgeCache(ns: string, key: string, value: unknown): void {
  const bucket = bucketFor(ns);
  bucket.set(key, { at: Date.now(), value });
  if (bucket.size <= MAX_ENTRIES_PER_NS) return;
  const oldest = bucket.keys().next().value;
  if (oldest) bucket.delete(oldest);
}

export function clearEdgeCache(ns?: string): void {
  if (ns) stores.delete(ns);
  else stores.clear();
}

export async function withEdgeCache<T>(
  ns: string,
  key: string,
  maxAgeMs: number,
  factory: () => Promise<T>,
): Promise<T> {
  const hit = getEdgeCache<T>(ns, key, maxAgeMs);
  if (hit !== null) return hit;
  const fresh = await factory();
  setEdgeCache(ns, key, fresh);
  return fresh;
}
