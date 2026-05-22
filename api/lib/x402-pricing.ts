/** x402 USDC amounts (6 decimal atomic units). */

export type X402ResourceKind = "news" | "concierge" | "signal-publish" | "signal-open";

export const X402_READ_PRICE_USDC = 0.1;
export const X402_READ_PRICE_ATOMIC = "100000";

/** Creator anti-spam: one-time publish fee */
export const X402_SIGNAL_PUBLISH_USDC = 1;
export const X402_SIGNAL_PUBLISH_ATOMIC = "1000000";

export function usdcToAtomic(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) throw new Error("Invalid USDC amount");
  return String(Math.round(usdc * 1_000_000));
}

export function atomicAmountForResource(
  kind: "news" | "concierge" | "signal-open" | "signal-publish",
): string {
  return kind === "signal-publish" ? X402_SIGNAL_PUBLISH_ATOMIC : X402_READ_PRICE_ATOMIC;
}

export function priceUsdcForResource(
  kind: "news" | "concierge" | "signal-open" | "signal-publish",
): number {
  return kind === "signal-publish" ? X402_SIGNAL_PUBLISH_USDC : X402_READ_PRICE_USDC;
}
