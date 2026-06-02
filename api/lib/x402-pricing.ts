/** x402 USDC amounts (6 decimal atomic units). */

export type X402CoreKind = "news" | "concierge" | "signal-publish" | "signal-open";

export type X402IntelKind =
  | "intel-tvl"
  | "intel-yields"
  | "intel-whales"
  | "intel-wallet"
  | "intel-verdict";

export type X402ResourceKind = X402CoreKind | X402IntelKind;

export const X402_READ_PRICE_USDC = 0.1;
export const X402_READ_PRICE_ATOMIC = "100000";

/** Creator anti-spam: one-time publish fee */
export const X402_SIGNAL_PUBLISH_USDC = 1;
export const X402_SIGNAL_PUBLISH_ATOMIC = "1000000";

export function usdcToAtomic(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) throw new Error("Invalid USDC amount");
  return String(Math.round(usdc * 1_000_000));
}

function isReadPriceKind(
  kind: X402ResourceKind,
): kind is X402CoreKind | X402IntelKind {
  return kind !== "signal-publish";
}

export function atomicAmountForResource(kind: X402ResourceKind): string {
  if (kind === "signal-publish") return X402_SIGNAL_PUBLISH_ATOMIC;
  if (isReadPriceKind(kind)) return X402_READ_PRICE_ATOMIC;
  return X402_READ_PRICE_ATOMIC;
}

export function priceUsdcForResource(kind: X402ResourceKind): number {
  if (kind === "signal-publish") return X402_SIGNAL_PUBLISH_USDC;
  return X402_READ_PRICE_USDC;
}

export function isIntelResourceKind(kind: X402ResourceKind): kind is X402IntelKind {
  return kind.startsWith("intel-");
}
