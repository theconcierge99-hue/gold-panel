/**
 * Grok Build CLI — terminal coding agent (x.ai/cli).
 * @see https://x.ai/cli
 * @see https://docs.x.ai/build/overview
 */
export const GROK_CLI_HOME = "https://x.ai/cli";
export const GROK_BUILD_DOCS = "https://docs.x.ai/build/overview";
export const GROK_INSTALL_SH = "curl -fsSL https://x.ai/cli/install.sh | bash";
export const GROK_INSTALL_PS = "irm https://x.ai/cli/install.ps1 | iex";

export function grokDiscoveryLinks(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    grokBuild: GROK_CLI_HOME,
    grokBuildDocs: GROK_BUILD_DOCS,
    grokBuildGuide: `${base}/docs/grok-build`,
    grokInstallSh: GROK_INSTALL_SH,
    grokInstallPs: GROK_INSTALL_PS,
    grokSkill: "concierge-intel",
    grokInspect: "grok inspect",
    grokSandboxIntel: `pay --sandbox curl ${base}/api/concierge-intel-tvl -d '{}'`,
  };
}
