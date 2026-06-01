/**
 * Provider-level metadata for x402 Bazaar / x402scan listings.
 * @see https://docs.x402.org/extensions/bazaar (serviceName, tags, iconUrl on resource)
 */
export const X402_SERVICE_TAGS = ["AI", "Trading", "Search", "Crypto", "RWA"] as const;

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
