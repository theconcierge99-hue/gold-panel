/** @deprecated Use `token-pay` — SOON x402 shim (default merchant = SOON). */
import { getSoonDecimals, getSoonMint } from "./soon-token";
import {
  formatTokenPayUiFromAtomic,
  getDefaultTokenPayMerchant,
  getTokenPayUsdRateAsync,
  isTokenPayX402Live,
  tokenPayAtomicForResourceAsync,
  tokenPayAtomicForResourceSync,
  tokenPaySupportsResource,
} from "./token-pay";
import { tokenAtomicForUsdcWithRate } from "./token-pay/amount";
import type { ResolvedTokenPrice } from "./token-pay/types";
import { getSoonUsdcRateFallback } from "./soon-price";

export type { ResolvedTokenPrice as ResolvedSoonPrice };

/** Resource kinds that may offer token pay alongside USDC (default merchant). */
export const SOON_X402_RESOURCE_KINDS = new Set(["concierge"]);

export function getSoonUsdcRate(): number | null {
  return getSoonUsdcRateFallback();
}

export function isSoonX402Enabled(): boolean {
  return isTokenPayX402Live(getDefaultTokenPayMerchant());
}

export function soonAtomicForUsdcWithRate(usdcAmount: number, rateUsd: number): string | null {
  const m = getDefaultTokenPayMerchant();
  return tokenAtomicForUsdcWithRate(m, usdcAmount, rateUsd);
}

export function soonAtomicForUsdc(usdcAmount: number): string | null {
  return tokenPayAtomicForResourceSync(usdcAmount);
}

export async function getSoonUsdcRateAsync(): Promise<ResolvedTokenPrice | null> {
  return getTokenPayUsdRateAsync();
}

export async function soonAtomicForUsdcAsync(usdcAmount: number): Promise<string | null> {
  if (!tokenPaySupportsResource("concierge")) return null;
  return tokenPayAtomicForResourceAsync(usdcAmount);
}

export function formatSoonUiFromAtomic(atomic: string, decimals = getSoonDecimals()): string {
  const m = getDefaultTokenPayMerchant();
  if (decimals !== m.decimals) {
    const n = BigInt(atomic);
    const whole = n / BigInt(10 ** decimals);
    return `${whole.toLocaleString("en-US")} ${m.symbol}`;
  }
  return formatTokenPayUiFromAtomic(atomic, m);
}

export { getSoonMint, getSoonDecimals };
