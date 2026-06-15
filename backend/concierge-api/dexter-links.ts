/**
 * Dexter / OpenDexter discovery links.
 * @see https://dexter.cash/
 * @see https://docs.dexter.cash/docs/build-with-x402/publishing-and-discovery/
 */
export const DEXTER_HOME = "https://dexter.cash/";
export const DEXTER_FACILITATOR = "https://x402.dexter.cash";
export const DEXTER_DOCS = "https://docs.dexter.cash/";
export const DEXTER_OPENDEXTER = "https://dexter.cash/opendexter";
export const DEXTER_SELLERS = "https://dexter.cash/sellers";
export const DEXTER_FACILITATOR_DOCS = "https://docs.dexter.cash/docs/facilitator-and-chains/";
export const DEXTER_OPENDEXTER_MCP = "https://open.dexter.cash/mcp";
export const DEXTER_OPENDEXTER_NPM = "https://www.npmjs.com/package/@dexterai/opendexter";
export const DEXTER_SUPPORTED = "https://x402.dexter.cash/supported";
export const DEXTER_MARKETPLACE_API =
  "https://api.dexter.cash/api/facilitator/marketplace/resources";

export function dexterDiscoveryLinks(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    dexter: DEXTER_HOME,
    dexterDocs: DEXTER_DOCS,
    dexterFacilitator: DEXTER_FACILITATOR,
    dexterFacilitatorDocs: DEXTER_FACILITATOR_DOCS,
    dexterSupported: DEXTER_SUPPORTED,
    openDexter: DEXTER_OPENDEXTER,
    openDexterMcp: DEXTER_OPENDEXTER_MCP,
    openDexterNpm: DEXTER_OPENDEXTER_NPM,
    dexterSellers: DEXTER_SELLERS,
    dexterMarketplaceApi: `${DEXTER_MARKETPLACE_API}?search=concierge&limit=10`,
    dexterSearchIntel: `x402_search(query: "market intelligence", network: "solana")`,
    openDexterInstall: `npx -y @dexterai/opendexter`,
    dexterProbeIntel: `${base}/api/concierge-intel-tvl`,
  };
}
