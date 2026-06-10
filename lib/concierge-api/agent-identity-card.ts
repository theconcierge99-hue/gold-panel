import { resolveX402SiteOrigin, resourceUrlForOrigin } from "./x402-discovery";
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
    protocols: ["x402", "mpp"],
    networks: ["solana", "eip155:8453"],
  };
}

export function buildAgentCard(origin: string, agent: AgentIdentityRecord): AgentCardJson {
  const base = origin.replace(/\/$/, "");
  const accounts: { chain: string; address: string }[] = [];
  if (agent.solAddress) accounts.push({ chain: "solana", address: agent.solAddress });
  if (agent.evmAddress) accounts.push({ chain: "eip155:8453", address: agent.evmAddress });

  return {
    schema: "executive-lounge-agent-card-v1",
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    registered: agent.createdAt,
    accounts,
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
        priceUsdc: 0.1,
      },
      {
        name: "intel-yields",
        endpoint: `${base}/api/concierge-intel-yields`,
        method: "POST",
        payment: "x402",
        priceUsdc: 0.1,
      },
      {
        name: "intel-whales",
        endpoint: `${base}/api/concierge-intel-whales`,
        method: "POST",
        payment: "x402",
        priceUsdc: 0.1,
      },
      {
        name: "intel-wallet",
        endpoint: `${base}/api/concierge-intel-wallet`,
        method: "POST",
        payment: "x402",
        priceUsdc: 0.1,
      },
      {
        name: "intel-verdict",
        endpoint: `${base}/api/concierge-intel-verdict`,
        method: "POST",
        payment: "x402",
        priceUsdc: 0.1,
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
      docs: `${base}/docs/agents`,
      paysh: "https://pay.sh/",
      payshGuide: `${base}/docs/payment/paysh`,
    },
  };
}

export function resolveOrigin(request: Request): string {
  return resolveX402SiteOrigin(request);
}
