/**
 * SOON/USD price — DexScreener with in-memory cache (Edge isolate, no extra serverless fn).
 * SOON_USDC_RATE env is fallback when API fails or SOON_PRICE_SOURCE=env.
 */
import { getSoonMint } from "./soon-token";

export type SoonPriceSource = "dexscreener" | "env";

type DexScreenerPair = {
  chainId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
};

type PriceCache = {
  usd: number;
  at: number;
  source: SoonPriceSource;
};

let priceCache: PriceCache | null = null;

export function getSoonPriceSource(): SoonPriceSource {
  const raw = (process.env.SOON_PRICE_SOURCE ?? "dexscreener").trim().toLowerCase();
  return raw === "env" ? "env" : "dexscreener";
}

export function getSoonPriceMaxAgeSec(): number {
  const n = Number(process.env.SOON_PRICE_MAX_AGE_SEC ?? "60");
  if (!Number.isFinite(n) || n < 10) return 60;
  return Math.min(n, 300);
}

export function getSoonUsdcRateFallback(): number | null {
  const raw = (process.env.SOON_USDC_RATE ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getSoonUsdMin(): number | null {
  const raw = (process.env.SOON_USD_MIN ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getSoonUsdMax(): number | null {
  const raw = (process.env.SOON_USD_MAX ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function passesUsdGuards(usd: number): boolean {
  const min = getSoonUsdMin();
  const max = getSoonUsdMax();
  if (min !== null && usd < min) return false;
  if (max !== null && usd > max) return false;
  return true;
}

async function fetchSoonUsdFromDexScreener(mint: string): Promise<number | null> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: DexScreenerPair[] };
    const solPairs = (data.pairs ?? []).filter((p) => p.chainId === "solana" && p.priceUsd);
    if (!solPairs.length) return null;
    const best = [...solPairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const price = Number(best.priceUsd);
    if (!Number.isFinite(price) || price <= 0 || !passesUsdGuards(price)) return null;
    return price;
  } catch {
    return null;
  }
}

export type ResolvedSoonPrice = {
  usd: number;
  source: SoonPriceSource;
};

/** Cached SOON/USD (1 SOON ≈ usd USDC). Returns null when mint unset or no price available. */
export async function resolveSoonUsdPrice(): Promise<ResolvedSoonPrice | null> {
  const mint = getSoonMint();
  if (!mint) return null;

  const maxAgeMs = getSoonPriceMaxAgeSec() * 1000;
  const now = Date.now();
  if (priceCache && now - priceCache.at < maxAgeMs) {
    return { usd: priceCache.usd, source: priceCache.source };
  }

  const source = getSoonPriceSource();

  if (source === "dexscreener") {
    const live = await fetchSoonUsdFromDexScreener(mint);
    if (live !== null) {
      priceCache = { usd: live, at: now, source: "dexscreener" };
      return { usd: live, source: "dexscreener" };
    }
  }

  const fallback = getSoonUsdcRateFallback();
  if (fallback !== null && passesUsdGuards(fallback)) {
    priceCache = { usd: fallback, at: now, source: "env" };
    return { usd: fallback, source: "env" };
  }

  return null;
}

export function clearSoonPriceCache(): void {
  priceCache = null;
}
