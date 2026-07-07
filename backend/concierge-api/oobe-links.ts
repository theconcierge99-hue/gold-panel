/**
 * OOBE Protocol — Synapse Agent Protocol (SAP) on Solana.
 * @see https://www.oobeprotocol.ai/
 * @see https://explorer.oobeprotocol.ai/docs
 */
export const OOBE_HOME = "https://www.oobeprotocol.ai/";
export const OOBE_EXPLORER = "https://explorer.oobeprotocol.ai/";
export const OOBE_SAP_DOCS = "https://explorer.oobeprotocol.ai/docs";
export const OOBE_X402_DOCS = "https://explorer.oobeprotocol.ai/docs/cli/x402";
export const OOBE_SAP_SDK = "https://www.npmjs.com/package/@oobe-protocol-labs/synapse-sap-sdk";

export function oobeDiscoveryLinks(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    oobe: OOBE_HOME,
    oobeExplorer: OOBE_EXPLORER,
    oobeSapDocs: OOBE_SAP_DOCS,
    oobeX402Docs: OOBE_X402_DOCS,
    oobeIntegrationGuide: `${base}/docs/integration/oobe`,
    oobeSapToolsManifest: `${base}/distribution/oobe/sap-tools-manifest.json`,
    oobeSkill: `${base}/skills/concierge-oobe/SKILL.md`,
    oobePayCurlVerdict: `pay curl ${base}/api/concierge-intel-verdict -d '{"message":"Solana DeFi outlook","includeInsider":true}'`,
    oobePayCurlMeteora: `pay curl ${base}/api/concierge-intel-meteora -d '{"sortByApy":true,"limit":8,"poolHint":"SOL"}'`,
  };
}
