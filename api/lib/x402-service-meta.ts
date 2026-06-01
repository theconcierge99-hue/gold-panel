/**
 * Provider-level metadata for x402 Bazaar / x402scan listings.
 * @see https://docs.x402.org/extensions/bazaar (serviceName, tags, iconUrl on resource)
 */
/** Listing pills on x402scan / AGENTCASH (exact casing). */
export const X402_SERVICE_TAGS = ["AI", "Trading", "Search", "Crypto", "RWA"] as const;

/** Per-route OpenAPI operation tags — explorers union these for the server Tags row. */
export const X402_OPERATION_TAGS: Record<
  "news" | "concierge" | "signal-publish" | "signal-open",
  readonly string[]
> = {
  news: ["Search", "Trading", "RWA"],
  concierge: ["AI", "Trading", "RWA"],
  "signal-publish": ["Crypto", "RWA"],
  "signal-open": ["Crypto", "RWA"],
};

export const X402_SERVICE_NAME = "Executive Lounge";

export const X402_SERVICE_TAGLINE =
  "Live market wire, RWA creator signals, and Concierge AI for the onchain economy. Browse free; unlock depth with USDC on Solana or Base.";

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
