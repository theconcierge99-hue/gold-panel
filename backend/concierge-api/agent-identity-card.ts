import { resolveX402SiteOrigin, resourceUrlForOrigin } from "./x402-discovery";
import { priceUsdcForResource } from "./x402-pricing";
import type { AgentCardJson, LoungeAgentServiceCard } from "./agent-identity-types";
import type { AgentIdentityRecord } from "./agent-identity-types";

export function buildLoungeServiceCard(origin: string): LoungeAgentServiceCard {
  const base = origin.replace(/\/$/, "");
  return {
    schema: "concierge-agent-registry-v1",
    name: "Concierge Agent Registry",
    description:
      "Register autonomous agent identities with Solana and/or Base wallets. Pay for Concierge via x402 USDC (MPP-discoverable) — no API keys.",
    registerEndpoint: `${base}/api/agent-identity`,
    docsUrl: `${base}/docs/agents`,
    payment: "x402-v2",
    protocols: ["x402", "mpp", "SAP"],
    networks: ["solana", "eip155:8453"],
    discovery: {
      x402: `${base}/.well-known/x402`,
      openapi: `${base}/openapi.json`,
      mcp: `${base}/api/mcp`,
      intelAccuracy: `${base}/api/concierge-intel-accuracy`,
      apiCatalog: `${base}/.well-known/api-catalog`,
      a2aMesh: `${base}/api/agent-a2a-mesh`,
      oobe: `${base}/docs/integration/oobe`,
      sapToolsManifest: `${base}/distribution/oobe/sap-tools-manifest.json`,
      caseStudy: `${base}/docs/builders/case-study`,
    },
    trust: {
      intelAccuracyEndpoint: `${base}/api/concierge-intel-accuracy`,
      description:
        "Free public leaderboard scoring paid intel-verdict signals vs 24h BTC alignment — observable trust signal for procurement and agent routing.",
    },
  };
}

export function buildAgentCard(origin: string, agent: AgentIdentityRecord): AgentCardJson {
  const base = origin.replace(/\/$/, "");
  const accounts: { chain: string; address: string }[] = [];
  if (agent.solAddress) accounts.push({ chain: "solana", address: agent.solAddress });
  if (agent.evmAddress) accounts.push({ chain: "eip155:8453", address: agent.evmAddress });
  if (agent.sapWallet && agent.sapWallet !== agent.solAddress) {
    accounts.push({ chain: "sap", address: agent.sapWallet });
  }

  const sap =
    agent.sapWallet || agent.sapAgentPda
      ? {
          wallet: agent.sapWallet,
          agentPda: agent.sapAgentPda,
          explorerUrl: agent.sapAgentPda
            ? `https://explorer.oobeprotocol.ai/agent/${agent.sapAgentPda}`
            : undefined,
        }
      : undefined;

  return {
    schema: "executive-lounge-agent-card-v1",
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    registered: agent.createdAt,
    accounts,
    sap,
    services: [
      {
        name: "concierge",
        endpoint: resourceUrlForOrigin(base, "concierge"),
        method: "POST",
        payment: "x402",
        priceUsdc: 0.1,
      },
      {
        name: "intel-tvl",
        endpoint: `${base}/api/concierge-intel-tvl`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-tvl"),
      },
      {
        name: "intel-meteora",
        endpoint: `${base}/api/concierge-intel-meteora`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-meteora"),
      },
      {
        name: "intel-desk-brief",
        endpoint: `${base}/api/concierge-intel-desk-brief`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-desk-brief"),
      },
      {
        name: "intel-a2a-pipeline",
        endpoint: `${base}/api/concierge-intel-a2a-pipeline`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-a2a-pipeline"),
      },
      {
        name: "intel-yields",
        endpoint: `${base}/api/concierge-intel-yields`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-yields"),
      },
      {
        name: "intel-whales",
        endpoint: `${base}/api/concierge-intel-whales`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-whales"),
      },
      {
        name: "intel-wallet",
        endpoint: `${base}/api/concierge-intel-wallet`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-wallet"),
      },
      {
        name: "intel-verdict",
        endpoint: `${base}/api/concierge-intel-verdict`,
        method: "POST",
        payment: "x402",
        priceUsdc: priceUsdcForResource("intel-verdict"),
      },
      {
        name: "news-open",
        endpoint: resourceUrlForOrigin(base, "news"),
        method: "POST",
        payment: "x402",
        priceUsdc: 0.1,
      },
    ],
    discovery: {
      x402: `${base}/.well-known/x402`,
      openapi: `${base}/openapi.json`,
      mcp: `${base}/api/mcp`,
      intelAccuracy: `${base}/api/concierge-intel-accuracy`,
      a2aMesh: `${base}/api/agent-a2a-mesh`,
      docs: `${base}/docs/agents`,
      paysh: "https://pay.sh/",
      payshGuide: `${base}/docs/payment/paysh`,
      grokBuild: "https://x.ai/cli",
      grokBuildGuide: `${base}/docs/grok-build`,
      oobe: `${base}/docs/integration/oobe`,
      sapToolsManifest: `${base}/distribution/oobe/sap-tools-manifest.json`,
    },
  };
}

export function resolveOrigin(request: Request): string {
  return resolveX402SiteOrigin(request);
}
