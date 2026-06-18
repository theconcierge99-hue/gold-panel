/** x402 USDC amounts (6 decimal atomic units). */

export type X402CoreKind = "news" | "concierge" | "signal-publish" | "signal-open";

export type X402IntelKind =
  | "intel-tvl"
  | "intel-yields"
  | "intel-whales"
  | "intel-wallet"
  | "intel-verdict"
  | "intel-airdrop"
  | "intel-listing"
  | "intel-momentum"
  | "intel-scalp"
  | "intel-macro"
  | "intel-wire"
  | "intel-meteora"
  | "intel-desk-brief";

export type X402ResourceKind = X402CoreKind | X402IntelKind;

export const X402_READ_PRICE_USDC = 0.1;
export const X402_READ_PRICE_ATOMIC = "100000";

/** Raw data desks — tiered entry for cost-sensitive integrators */
export const X402_RAW_PRICE_USDC = 0.02;
export const X402_RAW_PRICE_ATOMIC = "20000";

/** Signal / synthesis desks */
export const X402_SIGNAL_PRICE_USDC = 0.1;
export const X402_SIGNAL_PRICE_ATOMIC = "100000";

/** Composite morning brief */
export const X402_BUNDLE_PRICE_USDC = 0.25;
export const X402_BUNDLE_PRICE_ATOMIC = "250000";

/** Creator anti-spam: one-time publish fee */
export const X402_SIGNAL_PUBLISH_USDC = 1;
export const X402_SIGNAL_PUBLISH_ATOMIC = "1000000";

/** Raw-tier intel — $0.02/call (SOON holder free tier eligible post-launch) */
export const X402_RAW_INTEL_KINDS: readonly X402IntelKind[] = [
  "intel-tvl",
  "intel-macro",
  "intel-wire",
  "intel-whales",
] as const;

export function isRawIntelKind(kind: X402ResourceKind): kind is X402IntelKind {
  return (X402_RAW_INTEL_KINDS as readonly string[]).includes(kind);
}

export function usdcToAtomic(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) throw new Error("Invalid USDC amount");
  return String(Math.round(usdc * 1_000_000));
}

export function atomicAmountForResource(kind: X402ResourceKind): string {
  if (kind === "signal-publish") return X402_SIGNAL_PUBLISH_ATOMIC;
  if (kind === "intel-desk-brief") return X402_BUNDLE_PRICE_ATOMIC;
  if (isRawIntelKind(kind)) return X402_RAW_PRICE_ATOMIC;
  return X402_SIGNAL_PRICE_ATOMIC;
}

export function priceUsdcForResource(kind: X402ResourceKind): number {
  if (kind === "signal-publish") return X402_SIGNAL_PUBLISH_USDC;
  if (kind === "intel-desk-brief") return X402_BUNDLE_PRICE_USDC;
  if (isRawIntelKind(kind)) return X402_RAW_PRICE_USDC;
  return X402_SIGNAL_PRICE_USDC;
}

export function priceLabelForResource(kind: X402ResourceKind): string {
  return `$${priceUsdcForResource(kind).toFixed(2)}`;
}

export function isIntelResourceKind(kind: X402ResourceKind): kind is X402IntelKind {
  return kind.startsWith("intel-");
}

/** All pay-per-call resource kinds (used by SOON_RESOURCE_KINDS=all). */
export const ALL_X402_RESOURCE_KINDS: readonly X402ResourceKind[] = [
  "news",
  "concierge",
  "signal-publish",
  "signal-open",
  "intel-tvl",
  "intel-yields",
  "intel-whales",
  "intel-wallet",
  "intel-verdict",
  "intel-airdrop",
  "intel-listing",
  "intel-momentum",
  "intel-scalp",
  "intel-macro",
  "intel-wire",
  "intel-meteora",
  "intel-desk-brief",
] as const;
