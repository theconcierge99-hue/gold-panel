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

/**
 * MPPscan assigns a new /server/{hash} per registration — do not hardcode in HTML.
 * Set MPPSCAN_SERVER_URL in Vercel to the URL copied from the MPPscan server page.
 */
export function getMppscanServerUrl(): string | null {
  const raw = process.env.MPPSCAN_SERVER_URL?.trim();
  if (!raw) return null;
  if (!/^https:\/\/www\.mppscan\.com\/server\/[a-f0-9]+$/i.test(raw)) return null;
  return raw;
}

/** Fallback when env unset — site links use /go/mppscan instead. */
export function resolveMppscanProfileLink(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/go/mppscan`;
}

const PAYAI_FACILITATOR = "https://facilitator.payai.network";

/** AgentCash / MPPscan — dual-protocol (matches production MPP listings e.g. Hyre). */
export const MPP_PAYMENT_PROTOCOLS: Record<string, unknown>[] = [
  { x402: { network: "solana", facilitator: PAYAI_FACILITATOR } },
  { x402: { network: "base", facilitator: PAYAI_FACILITATOR } },
  { mpp: { method: "solana", intent: "charge", currency: "USDC" } },
];

export const CONCIERGE_OPENAPI_GUIDANCE = [
  "Concierge Agent is a pay-per-call market intelligence API. No API keys — payment is the only gate.",
  "Discover endpoints via GET /openapi.json. Each paid route accepts POST with application/json after x402 USDC settlement on Solana or Base (PayAI facilitator).",
  "Flow: POST without PAYMENT-SIGNATURE → 402 + PAYMENT-REQUIRED header → pay → retry with PAYMENT-SIGNATURE (base64 payment payload).",
  "Intel routes: /api/concierge-intel-tvl (empty body ok), intel-yields (chain/project), intel-whales (symbols), intel-wallet (solAddress/evmAddress), intel-verdict (message, includeInsider), intel-airdrop|intel-listing|intel-momentum (message, chain, limit, includeInsider), intel-scalp (symbols BTC|ETH|BNB|SOL, intervals 5m|15m).",
  "Concierge chat: POST /api/concierge with mode chat|enhance|image and message. Lounge: /api/news-open, /api/lounge-signal-publish ($1), /api/lounge-signal-open.",
  "CLI: npx agentcash discover <origin> · npx agentcash check <origin>/api/concierge-intel-tvl",
  "pay.sh: pay --sandbox curl <origin>/api/concierge-intel-tvl -d '{}' · pay skills search market intelligence",
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
  "intel-wallet": {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    description: "At least one of solAddress, evmAddress, or message (with address) is required.",
    properties: {
      solAddress: { type: "string", description: "Solana wallet address" },
      evmAddress: { type: "string", description: "EVM wallet address (0x…)" },
      message: { type: "string", description: "Optional context; may include an address" },
    },
    required: [],
  },
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
  "intel-airdrop": jsonSchemaBody(
    {
      message: { type: "string", description: "Focus theme or protocol name" },
      chain: { type: "string", description: "Optional chain filter (solana, ethereum, base)" },
      limit: { type: "number", description: "Max candidates 1–8 (default 5)" },
      includeInsider: { type: "boolean", description: "Include Lounge insider signals (default true)" },
    },
    [],
  ),
  "intel-listing": jsonSchemaBody(
    {
      message: { type: "string", description: "Token or listing catalyst focus" },
      chain: { type: "string" },
      limit: { type: "number" },
      includeInsider: { type: "boolean" },
    },
    [],
  ),
  "intel-momentum": jsonSchemaBody(
    {
      message: { type: "string", description: "Asset or momentum theme" },
      chain: { type: "string" },
      limit: { type: "number" },
      includeInsider: { type: "boolean" },
    },
    [],
  ),
  "intel-scalp": jsonSchemaBody(
    {
      message: { type: "string", description: "Scalp context (e.g. BTC 15m entry)" },
      symbols: {
        type: "array",
        items: { type: "string", enum: ["BTC", "ETH", "BNB", "SOL"] },
      },
      intervals: {
        type: "array",
        items: { type: "string", enum: ["5m", "15m"] },
      },
    },
    [],
  ),
};

const RESPONSE_SCHEMAS: Record<X402ResourceKind, Record<string, unknown>> = {
  news: jsonSchemaBody(
    {
      url: { type: "string", description: "Canonical article URL" },
      unlocked: { type: "boolean" },
      title: { type: "string" },
      source: { type: "string" },
    },
    ["url", "unlocked"],
  ),
  concierge: jsonSchemaBody(
    {
      reply: { type: "string", description: "HTML analysis from Concierge" },
      topics: { type: "array", items: { type: "string" } },
    },
    ["reply"],
  ),
  "signal-publish": jsonSchemaBody(
    {
      id: { type: "string" },
      published: { type: "boolean" },
      title: { type: "string" },
    },
    ["id", "published"],
  ),
  "signal-open": jsonSchemaBody(
    {
      signalId: { type: "string" },
      summary: { type: "string" },
      title: { type: "string" },
    },
    ["signalId", "summary"],
  ),
  "intel-tvl": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      chains: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            tvl: { type: "number" },
          },
        },
      },
      topProtocols: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            tvl: { type: "number" },
            category: { type: "string" },
          },
        },
      },
    },
    ["ok"],
  ),
  "intel-yields": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      pools: {
        type: "array",
        items: {
          type: "object",
          properties: {
            project: { type: "string" },
            chain: { type: "string" },
            apy: { type: "number" },
            symbol: { type: "string" },
          },
        },
      },
    },
    ["ok"],
  ),
  "intel-whales": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      positioning: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            longShortRatio: { type: "number" },
            bias: { type: "string" },
          },
        },
      },
    },
    ["ok"],
  ),
  "intel-wallet": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      wallet: jsonSchemaBody(
        {
          chain: { type: "string" },
          address: { type: "string" },
          tokens: { type: "array", items: { type: "object" } },
        },
        ["chain", "address"],
      ),
    },
    ["ok"],
  ),
  "intel-verdict": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      verdict: jsonSchemaBody(
        {
          signal: {
            type: "string",
            enum: ["snipe", "watch", "follow", "avoid", "rebalance"],
          },
          confidence: { type: "string" },
          summary: { type: "string" },
        },
        ["signal"],
      ),
    },
    ["ok", "verdict"],
  ),
  "intel-airdrop": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      summary: { type: "string" },
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            asset: { type: "string" },
            thesis: { type: "string" },
            conviction: { type: "string" },
            insiderWeight: { type: "string" },
          },
        },
      },
    },
    ["ok", "candidates"],
  ),
  "intel-listing": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      summary: { type: "string" },
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            asset: { type: "string" },
            thesis: { type: "string" },
            conviction: { type: "string" },
          },
        },
      },
    },
    ["ok", "candidates"],
  ),
  "intel-momentum": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      summary: { type: "string" },
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            asset: { type: "string" },
            direction: { type: "string", enum: ["up", "down", "neutral", "watch"] },
            thesis: { type: "string" },
            conviction: { type: "string" },
          },
        },
      },
    },
    ["ok", "candidates"],
  ),
  "intel-scalp": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      assets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            pair: { type: "string" },
            intervals: { type: "array" },
          },
        },
      },
    },
    ["ok", "assets"],
  ),
};

const REQUEST_BODY_EXAMPLES: Record<X402ResourceKind, Record<string, unknown>> = {
  news: {
    url: "https://www.bbc.com/news/example",
    title: "Example headline",
    source: "BBC",
  },
  concierge: {
    mode: "chat",
    message: "What is the macro outlook for BTC?",
    history: [],
    market: [],
  },
  "signal-publish": {
    title: "BTC dominance roll-down thesis",
    summary: "Dominance stalled at resistance; risk-curve rotation over 1–2 weeks.",
    categories: ["Crypto", "Macro"],
    creatorWallet: "0x0000000000000000000000000000000000000000",
    creatorChain: "evm",
  },
  "signal-open": { signalId: "sig_example000000000000000000000000" },
  "intel-tvl": {},
  "intel-yields": { chain: "solana", project: "meteora" },
  "intel-whales": { symbols: ["BTC", "ETH", "SOL"] },
  "intel-wallet": { solAddress: "7hum…", message: "optional context" },
  "intel-verdict": { message: "DeFi outlook on Solana", includeInsider: true },
  "intel-airdrop": { message: "Solana ecosystem airdrop farming", limit: 5, includeInsider: true },
  "intel-listing": { message: "Potential Binance listings", limit: 5 },
  "intel-momentum": { message: "BTC altcoin volatility catalysts", limit: 5, includeInsider: true },
  "intel-scalp": { message: "scalp BTC 15m", symbols: ["BTC"], intervals: ["5m", "15m"] },
};

const RESPONSE_BODY_EXAMPLES: Record<X402ResourceKind, Record<string, unknown>> = {
  news: { url: "https://www.bbc.com/news/example", unlocked: true, title: "Example", source: "BBC" },
  concierge: { reply: "<p>Analysis…</p>", topics: ["crypto", "macro"] },
  "signal-publish": { id: "sig_abc123", published: true, title: "BTC thesis" },
  "signal-open": { signalId: "sig_abc123", summary: "Full intelligence summary…", title: "BTC thesis" },
  "intel-tvl": { ok: true, chains: [{ name: "Solana", tvl: 4.2e9 }], topProtocols: [] },
  "intel-yields": { ok: true, pools: [{ project: "meteora", chain: "solana", apy: 12.4, symbol: "SOL-USDC" }] },
  "intel-whales": {
    ok: true,
    positioning: [{ symbol: "BTC", longShortRatio: 1.12, bias: "long" }],
  },
  "intel-wallet": {
    ok: true,
    wallet: { chain: "solana", address: "7hum…", tokens: [] },
  },
  "intel-verdict": {
    ok: true,
    verdict: { signal: "watch", confidence: "medium", summary: "Desk bias neutral…" },
  },
  "intel-airdrop": {
    ok: true,
    summary: "Two Solana protocols show insider + narrative airdrop overlap.",
    candidates: [
      {
        asset: "EXAMPLE",
        thesis: "Creator signal + TVL growth — monitor points program.",
        conviction: "medium",
        insiderWeight: "primary",
      },
    ],
  },
  "intel-listing": {
    ok: true,
    summary: "Listing desk scan complete.",
    candidates: [{ asset: "TOKEN", thesis: "Volume + headline listing rumor.", conviction: "low" }],
  },
  "intel-momentum": {
    ok: true,
    summary: "Momentum desk: crowded positioning watchlist.",
    candidates: [{ asset: "BTC", direction: "down", thesis: "Crowded long — liq risk on dips.", conviction: "medium" }],
  },
  "intel-scalp": {
    ok: true,
    filters: { symbols: ["BTC"], intervals: ["5m", "15m"], pairs: ["BTC/USDT"] },
    assets: [
      {
        symbol: "BTC",
        pair: "BTCUSDT",
        intervals: [{ interval: "15m", ta: { rsi14: 52, trend: "neutral", lastClose: 60781 } }],
      },
    ],
  },
};

export function openApiRequestSchema(kind: X402ResourceKind): Record<string, unknown> {
  return REQUEST_SCHEMAS[kind];
}

export function openApiResponseSchema(kind: X402ResourceKind): Record<string, unknown> {
  return RESPONSE_SCHEMAS[kind];
}

export function openApiResponseExample(kind: X402ResourceKind): Record<string, unknown> {
  return RESPONSE_BODY_EXAMPLES[kind];
}

/** Bazaar extension on 402 PAYMENT-REQUIRED — MPPscan requires output schema properties. */
export function buildBazaarExtension(kind: X402ResourceKind): Record<string, unknown> {
  const input = {
    type: "http",
    method: "POST",
    bodyType: "json",
    body: REQUEST_BODY_EXAMPLES[kind],
    headers: { "Content-Type": "application/json" },
  };

  const outputBodySchema = openApiResponseSchema(kind);

  return {
    bazaar: {
      info: {
        input,
        output: {
          type: "json",
          example: openApiResponseExample(kind),
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: {
          input: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { const: "http" },
              method: { const: "POST" },
              bodyType: { const: "json" },
              body: openApiRequestSchema(kind),
              headers: { type: "object" },
            },
            required: ["type", "method", "bodyType", "body"],
          },
          output: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { const: "json" },
              example: outputBodySchema,
              body: outputBodySchema,
            },
            required: ["type", "example"],
          },
        },
        required: ["input", "output"],
      },
    },
  };
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
    mppscanServer: getMppscanServerUrl() ?? resolveMppscanProfileLink(base),
    mppscanProfileLink: resolveMppscanProfileLink(base),
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
