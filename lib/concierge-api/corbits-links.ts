/**
 * Corbits product URLs — https://www.corbits.dev/
 * Marketplace + Discovery align with Concierge x402 OpenAPI (no backend rewrite).
 */
export const CORBITS_HOME = "https://www.corbits.dev/";
export const CORBITS_MARKETPLACE = "https://www.corbits.dev/marketplace";
export const CORBITS_INTERCHANGE = "https://interchange.corbits.xyz/";
export const CORBITS_DOCS_MARKETPLACE = "https://docs.corbits.dev/marketplace/overview";
export const CORBITS_DOCS_DISCOVERY = "https://docs.corbits.dev/discovery/overview";
export const CORBITS_DOCS_FAREMETER = "https://docs.corbits.dev/";
export const CORBITS_BOOK_DEMO = "https://www.corbits.dev/";

export const CONCIERGE_BACKEND_ORIGIN = "https://conc-exe.xyz";

export function corbitsDiscoveryLinks(): Record<string, string> {
  return {
    corbits: CORBITS_HOME,
    corbitsMarketplace: CORBITS_MARKETPLACE,
    corbitsDiscovery: CORBITS_DOCS_DISCOVERY,
    corbitsInterchange: CORBITS_INTERCHANGE,
    corbitsDocsMarketplace: CORBITS_DOCS_MARKETPLACE,
  };
}
