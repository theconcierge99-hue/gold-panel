/**
 * pay.sh — agent pay-per-call catalog (pay-skills registry).
 * @see https://pay.sh/
 * @see https://github.com/solana-foundation/pay-skills
 */
export const PAYSH_HOME = "https://pay.sh/";
export const PAYSH_CATALOG = "https://pay.sh/api/catalog";
export const PAYSH_DOCS = "https://pay.sh/docs/overview/index.md";
export const PAYSH_QUICKSTART = "https://pay.sh/docs/toolchain/install/index.md";
export const PAYSH_PUBLISH = "https://pay.sh/docs/building-with-pay/yaml-specification/index.md";
export const PAYSH_SKILLS_REPO = "https://github.com/solana-foundation/pay-skills";
export const PAYSH_CONTRIBUTE = "https://github.com/solana-foundation/pay-skills/blob/main/CONTRIBUTING.md";

/** Expected FQN after listing in pay-skills (providers/conc-exe/concierge-agent/). */
export const PAYSH_PROVIDER_FQN = "conc-exe/concierge-agent";

export function payshServiceMarkdownUrl(fqn: string = PAYSH_PROVIDER_FQN): string {
  return `https://pay.sh/services/${fqn}/index.md`;
}

export function payshDiscoveryLinks(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    paysh: PAYSH_HOME,
    payshCatalog: PAYSH_CATALOG,
    payshDocs: PAYSH_DOCS,
    payshContribute: PAYSH_CONTRIBUTE,
    payshProviderFqn: PAYSH_PROVIDER_FQN,
    payshSkillsSearch: `pay skills search "market intelligence"`,
    payshCurlIntel: `pay curl ${base}/api/concierge-intel-verdict -d '{"message":"Solana DeFi outlook","includeInsider":true}'`,
    payshCurlConcierge: `pay curl ${base}/api/concierge -d '{"mode":"chat","message":"BTC outlook"}'`,
    payshSandboxCurl: `pay --sandbox curl ${base}/api/concierge-intel-tvl -d '{}'`,
  };
}
