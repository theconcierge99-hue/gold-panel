/**
 * Google Gemma 4 Edge — on-device LiteRT-LM + Concierge x402 intel tools.
 * @see https://ai.google.dev/edge/litert-lm
 * @see https://ai.google.dev/gemma/docs/core/model_card_4
 */
export const GEMMA_HOME = "https://deepmind.google/models/gemma/gemma-4/";
export const LITERT_LM_DOCS = "https://ai.google.dev/edge/litert-lm";
export const GEMMA_HF_REPO = "litert-community/gemma-4-E2B-it-litert-lm";

export function gemmaDiscoveryLinks(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    gemma: GEMMA_HOME,
    litertLm: LITERT_LM_DOCS,
    gemmaIntegrationGuide: `${base}/docs/integration/gemma`,
    gemmaLitertManifest: `${base}/distribution/gemma/litert-tools-manifest.json`,
    gemmaEdgePreset: `${base}/distribution/gemma/concierge-edge-preset.py`,
    gemmaEdgeSkill: `${base}/skills/concierge-edge/SKILL.md`,
    gemmaPayCurlMacro: `pay curl ${base}/api/concierge-intel-macro -d '{}'`,
    gemmaPayCurlVerdict: `pay curl ${base}/api/concierge-intel-verdict -d '{"message":"Solana DeFi outlook","includeInsider":true}'`,
  };
}
