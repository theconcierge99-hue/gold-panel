/**
 * Token USD price — DexScreener per merchant mint, in-memory cache (Edge-safe).
 */
import type { ResolvedTokenPrice, TokenPayMerchant } from "./types";

type DexScreenerPair = {
  chainId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
};

type PriceCache = ResolvedTokenPrice & { at: number };

const priceCacheByMerchant = new Map<string, PriceCache>();

function passesUsdGuards(usd: number, merchant: TokenPayMerchant): boolean {
  const min = merchant.price.usdMin;
  const max = merchant.price.usdMax;
  if (min !== null && usd < min) return false;
  if (max !== null && usd > max) return false;
  return true;
}

async function fetchUsdFromDexScreener(mint: string): Promise<number | null> {
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
    if (!Number.isFinite(price) || price <= 0) return null;
    return price;
  } catch {
    return null;
  }
}

export async function resolveTokenUsdPrice(
  merchant: TokenPayMerchant,
): Promise<ResolvedTokenPrice | null> {
  if (!merchant.mint) return null;

  const maxAgeMs = merchant.price.maxAgeSec * 1000;
  const now = Date.now();
  const cached = priceCacheByMerchant.get(merchant.id);
  if (cached && now - cached.at < maxAgeMs) {
    return { usd: cached.usd, source: cached.source };
  }

  if (merchant.price.source === "dexscreener") {
    const live = await fetchUsdFromDexScreener(merchant.mint);
    if (live !== null && passesUsdGuards(live, merchant)) {
      priceCacheByMerchant.set(merchant.id, { usd: live, source: "dexscreener", at: now });
      return { usd: live, source: "dexscreener" };
    }
  }

  const fallback = merchant.price.fallbackUsd;
  if (fallback !== null && passesUsdGuards(fallback, merchant)) {
    priceCacheByMerchant.set(merchant.id, { usd: fallback, source: "env", at: now });
    return { usd: fallback, source: "env" };
  }

  return null;
}

export function clearTokenPriceCache(merchantId?: string): void {
  if (merchantId) priceCacheByMerchant.delete(merchantId);
  else priceCacheByMerchant.clear();
}
