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
  | "intel-desk-brief"
  | "intel-a2a-pipeline";

/** Passive security desk — scout ($0.02) + unified scan ($0.10) + async deep scan ($1.00) */
export type X402SecurityKind =
  | "security-readiness"
  | "security-headers"
  | "security-scan"
  | "security-deep-scan";

/** Concierge LP — session start ($0.25) */
export type X402LpKind = "concierge-lp";

/** Concierge Deep Scan — async worker (Nuclei/httpx templates), authorized targets only */
export const X402_DEEP_SCAN_PRICE_USDC = 1;
export const X402_DEEP_SCAN_PRICE_ATOMIC = "1000000";

/** Concierge LP session start */
export const X402_LP_SESSION_PRICE_USDC = 0.25;
export const X402_LP_SESSION_PRICE_ATOMIC = "250000";

/** MVP Concierge Resources — agent-friendly creative endpoints */
export type X402MvpResourceKind = "resource-chat" | "resource-image" | "resource-scaffold";

export type X402ResourceKind =
  | X402CoreKind
  | X402IntelKind
  | X402SecurityKind
  | X402LpKind
  | X402MvpResourceKind;

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

/** Concierge Resources — creative tier */
export const X402_RESOURCE_CHAT_USDC = 0.05;
export const X402_RESOURCE_CHAT_ATOMIC = "50000";

export const X402_RESOURCE_CREATIVE_USDC = 0.1;
export const X402_RESOURCE_CREATIVE_ATOMIC = "100000";

export const MVP_RESOURCE_KINDS: readonly X402MvpResourceKind[] = [
  "resource-chat",
  "resource-image",
  "resource-scaffold",
] as const;

export function isMvpResourceKind(kind: X402ResourceKind): kind is X402MvpResourceKind {
  return (MVP_RESOURCE_KINDS as readonly string[]).includes(kind);
}

/** Minimum settlement fee — same as raw intel tier (covers x402 network cost). */
export const X402_SIGNAL_PUBLISH_USDC = X402_RAW_PRICE_USDC;
export const X402_SIGNAL_PUBLISH_ATOMIC = X402_RAW_PRICE_ATOMIC;

/** Raw-tier intel — $0.02/call (SOON holder free tier eligible post-launch) */
export const X402_RAW_INTEL_KINDS: readonly X402IntelKind[] = [
  "intel-tvl",
  "intel-macro",
  "intel-wire",
  "intel-whales",
] as const;

/** Security scout routes — same price band as raw intel */
export const X402_RAW_SECURITY_KINDS: readonly X402SecurityKind[] = [
  "security-readiness",
  "security-headers",
] as const;

export function isRawIntelKind(kind: X402ResourceKind): kind is X402IntelKind {
  return (X402_RAW_INTEL_KINDS as readonly string[]).includes(kind);
}

export function isRawSecurityKind(kind: X402ResourceKind): kind is X402SecurityKind {
  return (X402_RAW_SECURITY_KINDS as readonly string[]).includes(kind);
}

export function isSecurityResourceKind(kind: X402ResourceKind): kind is X402SecurityKind {
  return (
    kind === "security-scan" ||
    kind === "security-deep-scan" ||
    isRawSecurityKind(kind)
  );
}

export function usdcToAtomic(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) throw new Error("Invalid USDC amount");
  return String(Math.round(usdc * 1_000_000));
}

export function atomicAmountForResource(kind: X402ResourceKind): string {
  if (kind === "signal-publish") return X402_SIGNAL_PUBLISH_ATOMIC;
  if (kind === "intel-desk-brief" || kind === "intel-a2a-pipeline") return X402_BUNDLE_PRICE_ATOMIC;
  if (kind === "security-scan") return X402_SIGNAL_PRICE_ATOMIC;
  if (kind === "security-deep-scan") return X402_DEEP_SCAN_PRICE_ATOMIC;
  if (kind === "concierge-lp") return X402_LP_SESSION_PRICE_ATOMIC;
  if (kind === "resource-chat") return X402_RESOURCE_CHAT_ATOMIC;
  if (kind === "resource-image" || kind === "resource-scaffold") return X402_RESOURCE_CREATIVE_ATOMIC;
  if (isRawIntelKind(kind) || isRawSecurityKind(kind)) return X402_RAW_PRICE_ATOMIC;
  return X402_SIGNAL_PRICE_ATOMIC;
}

export function priceUsdcForResource(kind: X402ResourceKind): number {
  if (kind === "signal-publish") return X402_SIGNAL_PUBLISH_USDC;
  if (kind === "intel-desk-brief" || kind === "intel-a2a-pipeline") return X402_BUNDLE_PRICE_USDC;
  if (kind === "security-scan") return X402_SIGNAL_PRICE_USDC;
  if (kind === "security-deep-scan") return X402_DEEP_SCAN_PRICE_USDC;
  if (kind === "concierge-lp") return X402_LP_SESSION_PRICE_USDC;
  if (kind === "resource-chat") return X402_RESOURCE_CHAT_USDC;
  if (kind === "resource-image" || kind === "resource-scaffold") return X402_RESOURCE_CREATIVE_USDC;
  if (isRawIntelKind(kind) || isRawSecurityKind(kind)) return X402_RAW_PRICE_USDC;
  return X402_SIGNAL_PRICE_USDC;
}

/** 1 credit = $0.01 USDC peg for TCX prepaid ledger */
export function creditsCostForResource(kind: X402ResourceKind): number {
  return Math.max(1, Math.round(priceUsdcForResource(kind) * 100));
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
  "intel-a2a-pipeline",
  "security-readiness",
  "security-headers",
  "security-scan",
  "security-deep-scan",
  "concierge-lp",
  "resource-chat",
  "resource-image",
  "resource-scaffold",
] as const;
