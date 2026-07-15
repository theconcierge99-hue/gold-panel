/**
 * Clean URL → static HTML (mirrors vercel.json rewrites for local dev).
 */
export const CONCIERGE_STATIC_REWRITES: Record<string, string> = {
  "/": "/agent.html",
  "/about": "/about.html",
  "/demo": "/demo.html",
  "/integrations": "/integrations.html",
  "/token": "/token.html",
  "/token/transparency": "/token-transparency.html",
  "/token/stake": "/token-stake.html",
  "/agent": "/agent.html",
  "/agent/identity": "/agent-identity.html",
  "/agent/endpoints": "/agent-endpoints.html",
  "/agent/playground": "/agent-playground.html",
  "/agent/discover": "/agent-discover.html",
  "/agent/skills": "/agent-skills.html",
  "/agent/token-pay": "/agent-token-pay.html",
  "/agent/token-pay/onboard": "/agent-token-pay-onboard.html",
  "/lounge": "/executive-lounge.html",
  "/docs": "/docs.html",
  "/docs/quickstart": "/docs-quickstart.html",
  "/docs/builders": "/docs-builders.html",
  "/docs/builders/case-study": "/docs-builders-case-study.html",
  "/docs/pricing": "/docs-pricing.html",
  "/docs/launch": "/docs-launch.html",
  "/docs/payment/x402": "/docs-payment-x402.html",
  "/docs/payment/mpp": "/docs-payment-mpp.html",
  "/docs/payment/paysh": "/docs-payment-paysh.html",
  "/docs/payment/token-pay": "/docs-payment-token-pay.html",
  "/docs/sdk/agent": "/docs-sdk-agent.html",
  "/docs/corbits": "/docs-corbits.html",
  "/docs/grok-build": "/docs-grok-build.html",
  "/docs/integration/dexter": "/docs-integration-dexter.html",
  "/docs/integration/payai": "/docs-integration-payai.html",
  "/docs/integration/x402scan": "/docs-integration-x402scan.html",
  "/docs/integration/mcp-registry": "/docs-integration-mcp-registry.html",
  "/docs/integration/poncho": "/docs-integration-poncho.html",
  "/docs/integration/hyre": "/docs-integration-hyre.html",
  "/docs/integration/anthropic": "/docs-integration-anthropic.html",
  "/docs/integration/openai": "/docs-integration-openai.html",
  "/docs/integration/zauth": "/docs-integration-zauth.html",
  "/docs/integration/metaplex": "/docs-integration-metaplex.html",
  "/docs/integration/agent-card": "/docs-integration-agent-card.html",
  "/docs/integration/privy": "/docs-integration-privy.html",
  "/docs/integration/oobe": "/docs-integration-oobe.html",
  "/docs/integration/gemma": "/docs-integration-gemma.html",
  "/docs/integration/hermes": "/docs-integration-hermes.html",
  "/docs/api/overview": "/docs-api-overview.html",
  "/docs/api/concierge": "/docs-api-concierge.html",
  "/docs/api/intel": "/docs-intel.html",
  "/docs/api/agent-identity": "/docs-agent-identity.html",
  "/docs/api/agent-readiness": "/docs-agent-readiness.html",
  "/docs/api/security": "/docs-security.html",
  "/docs/api/lounge": "/docs-api-lounge.html",
  "/docs/playground": "/docs-playground.html",
  "/docs/architecture": "/docs-architecture.html",
  "/docs/agents": "/docs-agents.html",
  "/docs/agent-identity": "/docs-agent-identity.html",
  "/docs/intel": "/docs-intel.html",
};

/** Paths Vite must handle (HMR, modules, assets) — skip rewrite. */
export function shouldSkipStaticRewrite(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/@")) return true;
  if (pathname.startsWith("/src/")) return true;
  if (pathname.startsWith("/node_modules/")) return true;
  if (pathname.startsWith("/__")) return true;
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true;
  return false;
}

export function resolveStaticRewrite(pathname: string): string | null {
  if (pathname === "/executive-lounge.html") return "/executive-lounge.html";
  return CONCIERGE_STATIC_REWRITES[pathname] ?? null;
}
