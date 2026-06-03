/**
 * MPP + AgentCash discovery helpers (OpenAPI x-payment-info, x-guidance).
 * @see https://agentcash.dev/discovery
 * @see https://mpp.dev/advanced/discovery
 */
import type { X402ResourceKind } from "./x402-pricing";
import { atomicAmountForResource } from "./x402-pricing";
import { X402_SERVICE_TAGS, x402ServiceListingMeta } from "./x402-service-meta";

export const MPPSCAN_REGISTER_URL = "https://www.mppscan.com/register";
export const MPPSCAN_EXPLORE_URL = "https://www.mppscan.com/";
export const MPPSCAN_DISCOVERY_DOC_URL = "https://www.mppscan.com/discovery";

/** AgentCash / MPPscan — dual-protocol payment advertisement (settlement via PayAI x402). */
export const MPP_PAYMENT_PROTOCOLS: Record<string, unknown>[] = [
  { x402: {} },
  { mpp: { method: "", intent: "charge", currency: "USDC" } },
];

export const CONCIERGE_OPENAPI_GUIDANCE = [
  "Concierge Agent is a pay-per-call market intelligence API. No API keys — payment is the only gate.",
  "Discover endpoints via GET /openapi.json. Each paid route accepts POST with application/json after x402 USDC settlement on Solana or Base (PayAI facilitator).",
  "Flow: POST without PAYMENT-SIGNATURE → 402 + PAYMENT-REQUIRED header → pay → retry with PAYMENT-SIGNATURE (base64 payment payload).",
  "Intel routes: /api/concierge-intel-tvl (empty body ok), intel-yields (chain/project), intel-whales (symbols), intel-wallet (solAddress/evmAddress), intel-verdict (message, includeInsider).",
  "Concierge chat: POST /api/concierge with mode chat|enhance|image and message. Lounge: /api/news-open, /api/lounge-signal-publish ($1), /api/lounge-signal-open.",
  "CLI: npx agentcash discover <origin> · npx agentcash check <origin>/api/concierge-intel-tvl",
].join(" ");

function jsonSchemaBody(
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const REQUEST_SCHEMAS: Record<X402ResourceKind, Record<string, unknown>> = {
  news: jsonSchemaBody(
    {
      url: { type: "string", description: "Article URL (http/https)" },
      title: { type: "string", description: "Headline title" },
      source: { type: "string", description: "Publisher name" },
    },
    ["url"],
  ),
  concierge: jsonSchemaBody(
    {
      mode: {
        type: "string",
        enum: ["chat", "enhance", "image"],
        description: "Concierge mode",
      },
      message: { type: "string", description: "User message" },
      history: {
        type: "array",
        description: "Prior chat turns",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "model"] },
            text: { type: "string" },
          },
          required: ["role", "text"],
        },
      },
      market: { type: "array", description: "Optional market ticks from UI" },
      signal: {
        type: "object",
        description: "Optional signal draft for enhance mode",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
        },
      },
    },
    ["message"],
  ),
  "signal-publish": jsonSchemaBody(
    {
      title: { type: "string" },
      summary: { type: "string" },
      categories: { type: "array", items: { type: "string" } },
      creatorWallet: { type: "string" },
      creatorChain: { type: "string", enum: ["sol", "evm"] },
    },
    ["title", "summary", "categories", "creatorWallet", "creatorChain"],
  ),
  "signal-open": jsonSchemaBody(
    { signalId: { type: "string", description: "Published signal id" } },
    ["signalId"],
  ),
  "intel-tvl": jsonSchemaBody(
    { message: { type: "string", description: "Optional context for logging" } },
    [],
  ),
  "intel-yields": jsonSchemaBody(
    {
      chain: { type: "string", description: "solana | ethereum | base | arbitrum" },
      project: { type: "string", description: "Filter project id substring" },
      message: { type: "string" },
    },
    [],
  ),
  "intel-whales": jsonSchemaBody(
    {
      symbols: {
        type: "array",
        items: { type: "string", enum: ["BTC", "ETH", "SOL"] },
      },
    },
    [],
  ),
  "intel-wallet": jsonSchemaBody(
    {
      solAddress: { type: "string" },
      evmAddress: { type: "string" },
      message: { type: "string" },
    },
    [],
  ),
  "intel-verdict": jsonSchemaBody(
    {
      message: { type: "string", description: "Question or theme for verdict" },
      includeInsider: {
        type: "boolean",
        description: "Include Lounge creator signals (default true)",
      },
    },
    ["message"],
  ),
};

const RESPONSE_SCHEMAS: Record<X402ResourceKind, Record<string, unknown>> = {
  news: {
    type: "object",
    properties: {
      url: { type: "string" },
      unlocked: { type: "boolean" },
    },
    required: ["url"],
  },
  concierge: {
    type: "object",
    properties: {
      reply: { type: "string" },
      topics: { type: "array", items: { type: "string" } },
    },
  },
  "signal-publish": {
    type: "object",
    properties: {
      id: { type: "string" },
      published: { type: "boolean" },
    },
  },
  "signal-open": {
    type: "object",
    properties: {
      signalId: { type: "string" },
      summary: { type: "string" },
    },
  },
  "intel-tvl": {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      chains: { type: "array", items: { type: "object" } },
      topProtocols: { type: "array", items: { type: "object" } },
    },
    required: ["ok"],
  },
  "intel-yields": {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      pools: { type: "array", items: { type: "object" } },
    },
    required: ["ok"],
  },
  "intel-whales": {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      positioning: { type: "array", items: { type: "object" } },
    },
    required: ["ok"],
  },
  "intel-wallet": {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      wallet: { type: "object" },
    },
    required: ["ok"],
  },
  "intel-verdict": {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      verdict: { type: "object" },
    },
    required: ["ok"],
  },
};

export function openApiRequestSchema(kind: X402ResourceKind): Record<string, unknown> {
  return REQUEST_SCHEMAS[kind];
}

export function openApiResponseSchema(kind: X402ResourceKind): Record<string, unknown> {
  return RESPONSE_SCHEMAS[kind];
}

/** Fixed USD amount with six decimal places for AgentCash validators. */
export function formatUsdAmountForDiscovery(priceUsd: string): string {
  const n = Number(priceUsd);
  if (!Number.isFinite(n)) return priceUsd;
  return n.toFixed(6);
}

export function buildXPaymentInfo(priceUsd: string, kind: X402ResourceKind): Record<string, unknown> {
  const amount = formatUsdAmountForDiscovery(priceUsd);
  const atomic = atomicAmountForResource(kind);
  return {
    price: { mode: "fixed", currency: "USD", amount },
    protocols: MPP_PAYMENT_PROTOCOLS,
    offers: [
      {
        protocol: "x402",
        amount: atomic,
        currency: "USDC",
        intent: "charge",
        description: `$${priceUsd} USDC via PayAI (Solana or Base)`,
      },
      {
        protocol: "mpp",
        amount: atomic,
        currency: "USDC",
        intent: "charge",
        description: `$${priceUsd} USDC — x402 settlement compatible with MPP clients`,
      },
    ],
  };
}

export function buildXServiceInfo(origin: string): Record<string, unknown> {
  const listing = x402ServiceListingMeta(origin);
  return {
    name: listing.serviceName,
    description: listing.description,
    tags: listing.tags,
    iconUrl: listing.iconUrl,
    protocols: ["x402", "mpp"],
    facilitator: "PayAI",
    networks: ["solana", "base"],
  };
}

export function mppDiscoveryLinks(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    mppscanRegister: MPPSCAN_REGISTER_URL,
    mppscan: MPPSCAN_EXPLORE_URL,
    mppscanDiscovery: MPPSCAN_DISCOVERY_DOC_URL,
    agentcashDiscover: `npx -y @agentcash/discovery@latest discover ${base}`,
    agentcashCheckIntel: `npx -y @agentcash/discovery@latest check ${base}/api/concierge-intel-tvl`,
  };
}

export function isIntelKindWithGetProbe(kind: X402ResourceKind): boolean {
  return kind.startsWith("intel-");
}

/** Query parameters for GET probe / agent tools (intel routes only). */
export function openApiQueryParameters(kind: X402ResourceKind): Record<string, unknown>[] {
  const schema = REQUEST_SCHEMAS[kind];
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: string[] }>;
  const params: Record<string, unknown>[] = [];
  for (const [name, def] of Object.entries(props)) {
    params.push({
      name,
      in: "query",
      required: false,
      schema: {
        type: def.type ?? "string",
        ...(def.enum ? { enum: def.enum } : {}),
      },
    });
  }
  return params;
}

export const MPP_MARKETPLACE_TAGS = [...X402_SERVICE_TAGS];
