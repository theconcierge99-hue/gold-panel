/**
 * Provider-level metadata for x402 Bazaar / x402scan listings.
 * @see https://docs.x402.org/extensions/bazaar (serviceName, tags, iconUrl on resource)
 */
/** Listing pills on x402scan / AGENTCASH (exact casing). */
export const X402_SERVICE_TAGS = [
  "AI",
  "Research",
  "News",
  "Trading",
  "Search",
  "Crypto",
  "RWA",
  "Utility",
] as const;

/** Per-route OpenAPI operation tags — explorers union these for the server Tags row. */
export const X402_OPERATION_TAGS: Record<
  | "news"
  | "concierge"
  | "signal-publish"
  | "signal-open"
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
  | "intel-a2a-pipeline"
  | "security-readiness"
  | "security-headers"
  | "security-scan",
  readonly string[]
> = {
  news: ["Search", "News", "Research", "RWA"],
  concierge: ["AI", "Research", "Trading", "RWA"],
  "signal-publish": ["Crypto", "RWA"],
  "signal-open": ["Crypto", "RWA"],
  "intel-tvl": ["AI", "Crypto", "Trading"],
  "intel-yields": ["AI", "Crypto", "Trading"],
  "intel-whales": ["AI", "Crypto", "Trading"],
  "intel-wallet": ["AI", "Crypto", "Trading"],
  "intel-verdict": ["AI", "Crypto", "Trading", "RWA"],
  "intel-airdrop": ["AI", "Crypto", "Trading", "RWA"],
  "intel-listing": ["AI", "Crypto", "Trading", "RWA"],
  "intel-momentum": ["AI", "Crypto", "Trading", "RWA"],
  "intel-scalp": ["AI", "Crypto", "Trading"],
  "intel-macro": ["Research", "News", "Utility"],
  "intel-wire": ["News", "Research", "Search"],
  "intel-meteora": ["AI", "Crypto", "Trading", "Utility"],
  "intel-desk-brief": ["AI", "Research", "Trading", "RWA"],
  "intel-a2a-pipeline": ["AI", "Research", "Trading", "RWA", "Utility"],
  "security-readiness": ["Utility", "Research", "AI"],
  "security-headers": ["Utility", "Research"],
  "security-scan": ["Utility", "Research", "AI"],
};

export const X402_SERVICE_NAME = "Concierge Agent";

export const X402_SERVICE_TAGLINE =
  "Market intelligence as a service — pay-per-call Concierge AI, macro & wire research, DeFi intel APIs, and Lounge RWA signals. USDC on Solana or Base via x402 (MPP-compatible discovery).";

export function x402ServiceListingMeta(origin: string): {
  serviceName: string;
  description: string;
  tags: string[];
  iconUrl: string;
} {
  const base = origin.replace(/\/$/, "");
  return {
    serviceName: X402_SERVICE_NAME,
    description: X402_SERVICE_TAGLINE,
    tags: [...X402_SERVICE_TAGS],
    iconUrl: `${base}/images/the-concierge-logo.png`,
  };
}
