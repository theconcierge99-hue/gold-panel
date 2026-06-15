/**
 * SOON as x402 payment asset (self-settle on Solana) — amount pegged to USDC list price.
 */
import { getSoonDecimals, getSoonMint } from "./soon-token";
import {
  getSoonPriceSource,
  getSoonUsdcRateFallback,
  resolveSoonUsdPrice,
  type ResolvedSoonPrice,
} from "./soon-price";

export type { ResolvedSoonPrice };

/** Resource kinds that may offer SOON alongside USDC (Phase 1: concierge only). */
export const SOON_X402_RESOURCE_KINDS = new Set(["concierge"]);

/** Static fallback rate from env (pre-launch / DexScreener outage). */
export function getSoonUsdcRate(): number | null {
  return getSoonUsdcRateFallback();
}

/**
 * SOON x402 is on when mint is set (post-launch env).
 * Pre-launch: leave SOON_TOKEN_MINT unset — SOON pay stays hidden.
 */
export function isSoonX402Enabled(): boolean {
  if (!getSoonMint()) return false;
  if (process.env.SOON_X402_ENABLED === "false") return false;
  if (getSoonPriceSource() === "env") return getSoonUsdcRateFallback() !== null;
  return true;
}

export function soonAtomicForUsdcWithRate(usdcAmount: number, rateUsd: number): string | null {
  const mint = getSoonMint();
  if (!mint || !Number.isFinite(usdcAmount) || usdcAmount <= 0) return null;
  if (!Number.isFinite(rateUsd) || rateUsd <= 0) return null;
  const decimals = getSoonDecimals();
  const soonUi = usdcAmount / rateUsd;
  const factor = 10 ** decimals;
  const atomic = BigInt(Math.ceil(soonUi * factor));
  if (atomic <= 0n) return null;
  return atomic.toString();
}

/** Sync amount using env fallback only (config snapshot / tests). */
export function soonAtomicForUsdc(usdcAmount: number): string | null {
  const rate = getSoonUsdcRateFallback();
  if (!rate) return null;
  return soonAtomicForUsdcWithRate(usdcAmount, rate);
}

export async function getSoonUsdcRateAsync(): Promise<ResolvedSoonPrice | null> {
  return resolveSoonUsdPrice();
}

export async function soonAtomicForUsdcAsync(usdcAmount: number): Promise<string | null> {
  const resolved = await resolveSoonUsdPrice();
  if (!resolved) return null;
  return soonAtomicForUsdcWithRate(usdcAmount, resolved.usd);
}

export function formatSoonUiFromAtomic(atomic: string, decimals = getSoonDecimals()): string {
  const n = BigInt(atomic);
  const whole = n / BigInt(10 ** decimals);
  return whole.toLocaleString("en-US");
}
