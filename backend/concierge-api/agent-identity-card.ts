import { resolveX402SiteOrigin, resourceUrlForOrigin } from "./x402-discovery";
import { priceUsdcForResource } from "./x402-pricing";
import type {
  AgentCardJson,
  Erc8004RegistrationFile,
  LoungeAgentServiceCard,
} from "./agent-identity-types";
import type { AgentIdentityRecord } from "./agent-identity-types";
import {
  basescanTokenUrl,
  basescanTxUrl,
  ERC8004_DEFAULT_CHAIN_ID,
  ERC8004_IDENTITY_REGISTRY,
  ERC8004_REGISTRATION_TYPE,
  registrationFileUrl,
} from "./erc-8004";

export function buildLoungeServiceCard(origin: string): LoungeAgentServiceCard {
  const base = origin.replace(/\/$/, "");
  return {
    schema: "concierge-agent-registry-v1",
    name: "Concierge Agent Registry",
    description:
      "Register autonomous agent identities with Solana, Base, and Arbitrum wallets. Mint optional ERC-8004 Identity NFTs on Base. Pay for Concierge via x402 USDC (MPP-discoverable) — no API keys.",
    registerEndpoint: `${base}/api/agent-identity`,
    docsUrl: `${base}/docs/agents`,
    payment: "x402-v2",
    protocols: ["x402", "mpp", "SAP", "ERC-8004"],
    networks: ["solana", "eip155:8453", "eip155:42161"],
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

export function buildErc8004RegistrationFile(
  origin: string,
  agent: AgentIdentityRecord,
): Erc8004RegistrationFile {
  const base = origin.replace(/\/$/, "");
  const services: Erc8004RegistrationFile["services"] = [
    {
      name: "A2A",
      endpoint: `${base}/api/agent-identity-card?id=${encodeURIComponent(agent.id)}`,
      version: "1.0.0",
    },
    {
      name: "MCP",
      endpoint: `${base}/api/mcp`,
      version: "1.1.0",
    },
    {
      name: "web",
      endpoint: `${base}/docs/agents`,
    },
    {
      name: "openapi",
      endpoint: `${base}/openapi.json`,
    },
  ];
  if (agent.evmAddress) {
    services.push({
      name: "agentWallet",
      endpoint: `eip155:${ERC8004_DEFAULT_CHAIN_ID}:${agent.evmAddress}`,
    });
  }
  if (agent.solAddress) {
    services.push({
      name: "solanaWallet",
      endpoint: agent.solAddress,
    });
  }

  const registrations = agent.erc8004
    ? [
        {
          agentId: Number(agent.erc8004.agentId),
          agentRegistry: agent.erc8004.agentRegistry,
        },
      ]
    : [];

  return {
    type: ERC8004_REGISTRATION_TYPE,
    name: agent.name,
    description:
      agent.description ||
      `Concierge agent ${agent.id} — x402 market intel on Solana / Base / Arbitrum.`,
    image: `${base}/images/the-concierge-logo.png`,
    services,
    x402Support: true,
    active: true,
    registrations,
    supportedTrust: ["reputation"],
    concierge: {
      agtId: agent.id,
      cardUrl: `${base}/api/agent-identity-card?id=${encodeURIComponent(agent.id)}`,
      profileUrl: `${base}/api/agent-identity?id=${encodeURIComponent(agent.id)}`,
    },
  };
}

export function buildAgentCard(origin: string, agent: AgentIdentityRecord): AgentCardJson {
  const base = origin.replace(/\/$/, "");
  const accounts: { chain: string; address: string }[] = [];
  if (agent.solAddress) accounts.push({ chain: "solana", address: agent.solAddress });
  if (agent.evmAddress) {
    accounts.push({ chain: "eip155:8453", address: agent.evmAddress });
    accounts.push({ chain: "eip155:42161", address: agent.evmAddress });
  }
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

  const registrationUrl = registrationFileUrl(base, agent.id);
  const erc8004 = agent.erc8004
    ? {
        ...agent.erc8004,
        registrationUrl,
        explorerTx: basescanTxUrl(agent.erc8004.txHash, agent.erc8004.chainId),
        explorerToken: basescanTokenUrl(
          agent.erc8004.agentId,
          agent.erc8004.chainId,
          agent.erc8004.registry,
        ),
      }
    : undefined;

  return {
    schema: "executive-lounge-agent-card-v1",
    type: ERC8004_REGISTRATION_TYPE,
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    registered: agent.createdAt,
    accounts,
    sap,
    erc8004,
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
      registration: registrationUrl,
      erc8004Prepare: `${base}/api/agent-identity-erc8004?id=${encodeURIComponent(agent.id)}`,
    },
  };
}

export function resolveOrigin(request: Request): string {
  return resolveX402SiteOrigin(request);
}

export { ERC8004_IDENTITY_REGISTRY, ERC8004_DEFAULT_CHAIN_ID };
