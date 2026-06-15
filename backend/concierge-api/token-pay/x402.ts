/**
 * x402 integration — default merchant accepts for Token Pay platform.
 */
import {
  formatTokenUiFromAtomic,
  getTokenUsdRateAsync,
  tokenAtomicForUsdcAsync,
  tokenAtomicForUsdcSync,
} from "./amount";
import {
  getDefaultTokenPayMerchant,
  getDefaultTokenPayMerchantId,
  isTokenPayMerchantLive,
  merchantSupportsResource,
} from "./registry";
import type { TokenPayAcceptExtra, TokenPayMerchant } from "./types";

export function getTokenPayMerchantForX402(): TokenPayMerchant {
  return getDefaultTokenPayMerchant();
}

export function isTokenPayX402Live(merchant: TokenPayMerchant = getDefaultTokenPayMerchant()): boolean {
  return isTokenPayMerchantLive(merchant);
}

export function tokenPaySupportsResource(
  resourceKind: string,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): boolean {
  return merchant.x402Enabled && merchantSupportsResource(merchant, resourceKind);
}

export function buildTokenPayAcceptExtra(merchant: TokenPayMerchant): TokenPayAcceptExtra {
  return {
    settlement: "self",
    merchantId: merchant.id,
    name: merchant.symbol,
    decimals: merchant.decimals,
  };
}

export async function tokenPayAtomicForResourceAsync(
  usdcAmount: number,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): Promise<string | null> {
  if (!isTokenPayMerchantLive(merchant)) return null;
  return tokenAtomicForUsdcAsync(merchant, usdcAmount);
}

export function tokenPayAtomicForResourceSync(
  usdcAmount: number,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): string | null {
  if (!merchant.mint) return null;
  return tokenAtomicForUsdcSync(merchant, usdcAmount);
}

export async function getTokenPayUsdRateAsync(
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
) {
  return getTokenUsdRateAsync(merchant);
}

export function formatTokenPayUiFromAtomic(
  atomic: string,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): string {
  return formatTokenUiFromAtomic(merchant, atomic);
}

export { getDefaultTokenPayMerchantId };
