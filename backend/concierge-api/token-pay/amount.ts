/**
 * Peg x402 USDC list price → SPL token atomic units.
 */
import { resolveTokenUsdPrice } from "./price";
import type { ResolvedTokenPrice, TokenPayMerchant } from "./types";

export function tokenAtomicForUsdcWithRate(
  merchant: TokenPayMerchant,
  usdcAmount: number,
  rateUsd: number,
): string | null {
  if (!merchant.mint || !Number.isFinite(usdcAmount) || usdcAmount <= 0) return null;
  if (!Number.isFinite(rateUsd) || rateUsd <= 0) return null;
  const tokenUi = usdcAmount / rateUsd;
  const factor = 10 ** merchant.decimals;
  const atomic = BigInt(Math.ceil(tokenUi * factor));
  if (atomic <= 0n) return null;
  return atomic.toString();
}

export function tokenAtomicForUsdcSync(
  merchant: TokenPayMerchant,
  usdcAmount: number,
): string | null {
  const rate = merchant.price.fallbackUsd;
  if (!rate) return null;
  return tokenAtomicForUsdcWithRate(merchant, usdcAmount, rate);
}

export async function tokenAtomicForUsdcAsync(
  merchant: TokenPayMerchant,
  usdcAmount: number,
): Promise<string | null> {
  const resolved = await resolveTokenUsdPrice(merchant);
  if (!resolved) return null;
  return tokenAtomicForUsdcWithRate(merchant, usdcAmount, resolved.usd);
}

export async function getTokenUsdRateAsync(
  merchant: TokenPayMerchant,
): Promise<ResolvedTokenPrice | null> {
  return resolveTokenUsdPrice(merchant);
}

export function formatTokenUiFromAtomic(
  merchant: TokenPayMerchant,
  atomic: string,
): string {
  const n = BigInt(atomic);
  const whole = n / BigInt(10 ** merchant.decimals);
  return `${whole.toLocaleString("en-US")} ${merchant.symbol}`;
}
