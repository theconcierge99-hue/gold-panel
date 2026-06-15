/** @deprecated Use `token-pay` — SOON price shim for backward compatibility. */
import { getDefaultTokenPayMerchant } from "./token-pay";
import { clearTokenPriceCache, resolveTokenUsdPrice } from "./token-pay/price";
import type { ResolvedTokenPrice, TokenPayPriceSource } from "./token-pay/types";

export type SoonPriceSource = TokenPayPriceSource;
export type ResolvedSoonPrice = ResolvedTokenPrice;

function soonMerchant() {
  return getDefaultTokenPayMerchant();
}

export function getSoonPriceSource(): SoonPriceSource {
  return soonMerchant().price.source;
}

export function getSoonPriceMaxAgeSec(): number {
  return soonMerchant().price.maxAgeSec;
}

export function getSoonUsdcRateFallback(): number | null {
  return soonMerchant().price.fallbackUsd;
}

export async function resolveSoonUsdPrice(): Promise<ResolvedSoonPrice | null> {
  return resolveTokenUsdPrice(soonMerchant());
}

export function clearSoonPriceCache(): void {
  clearTokenPriceCache(soonMerchant().id);
}
