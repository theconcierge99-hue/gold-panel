/**
 * MPP + AgentCash discovery helpers (OpenAPI x-payment-info, x-guidance).
 * @see https://agentcash.dev/discovery
 * @see https://mpp.dev/advanced/discovery
 */
import type { X402ResourceKind } from "./x402-pricing";
import { atomicAmountForResource } from "./x402-pricing";
import { X402_SERVICE_TAGS, x402ServiceListingMeta } from "./x402-service-meta";
import { getX402FacilitatorProfile, getX402FacilitatorFallback, mppPaymentProtocols } from "./x402-facilitator";

export const MPPSCAN_REGISTER_URL = "https://www.mppscan.com/register";
export const MPPSCAN_EXPLORE_URL = "https://www.mppscan.com/";
export const MPPSCAN_DISCOVERY_DOC_URL = "https://www.mppscan.com/discovery";
export const MPPSCAN_DEFAULT_SERVER_URL =
  "https://www.mppscan.com/server/6ded0eed8d9dd654f2021f37268ea5f782be7e0c3265640c13568a37effb53d1";

/**
 * MPPscan derives /server/{hash} from the registered origin. Keep the verified
 * production profile as the default and allow an env override for migrations.
 */
export function getMppscanServerUrl(): string | null {
  const raw = process.env.MPPSCAN_SERVER_URL?.trim();
  if (!raw) return MPPSCAN_DEFAULT_SERVER_URL;
  if (!/^https:\/\/www\.mppscan\.com\/server\/[a-f0-9]+$/i.test(raw)) {
    return MPPSCAN_DEFAULT_SERVER_URL;
  }
  return raw;
}

/** Fallback when env unset — site links use /go/mppscan instead. */
export function resolveMppscanProfileLink(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/go/mppscan`;
}

function facilitatorLabel(): string {
  const primary = getX402FacilitatorProfile();
  const fallback = getX402FacilitatorFallback();
  return `${primary.name} (primary) · ${fallback.name} (fallback)`;
}

/** AgentCash / MPPscan — dual-protocol (matches production MPP listings e.g. Hyre). */
export function getMppPaymentProtocols(): Record<string, unknown>[] {
  return mppPaymentProtocols();
}

export const CONCIERGE_OPENAPI_GUIDANCE = [
  "Concierge Agent is a pay-per-call market intelligence API. No API keys — payment is the only gate.",
  `Discover endpoints via GET /openapi.json. Each paid route accepts POST with application/json after x402 USDC settlement on Solana, Base, or Arbitrum (${facilitatorLabel()}).`,
  "Flow: POST without PAYMENT-SIGNATURE → 402 + PAYMENT-REQUIRED header → pay → retry with PAYMENT-SIGNATURE (base64 payment payload).",
  "Intel routes: raw tier $0.02 — intel-tvl, intel-macro, intel-wire, intel-whales. Signal tier $0.10 — yields, wallet, verdict, alpha desks, scalp, intel-meteora. Bundle $0.25 — intel-desk-brief. Free GET — /api/concierge-intel-accuracy. MCP — POST /api/mcp (tools/list, tools/call). intel-meteora (sortByApy, poolHint, limit), intel-desk-brief (message, includeInsider). TCX holders: X-Soon-Holder-Wallet + raw tier = free calls post-launch.",
  "Concierge chat: POST /api/concierge with mode chat|enhance|image and message. Lounge: /api/news-open, /api/lounge-signal-publish ($0.02), /api/lounge-signal-open.",
  "CLI: npx agentcash discover <origin> · npx agentcash check <origin>/api/concierge-intel-tvl",
  "OpenDexter: npx -y @dexterai/opendexter · x402_search for Dexter marketplace discovery",
  "pay.sh: pay --sandbox curl <origin>/api/concierge-intel-tvl -d '{}' · pay skills search market intelligence",
  "Idempotency: optional Idempotency-Key header on POST mutating routes. Reuse the same PAYMENT-SIGNATURE after a successful x402 settlement — facilitators will not double-charge the same on-chain payment.",
  "Rate limits: soft limit 120 requests/minute per IP on /api/* — responses include X-RateLimit-Limit; 429 returns Retry-After.",
  "Discovery index: GET /.well-known/api-catalog (RFC 9727 linkset) · GET /llms.txt · GET /.well-known/agent-card.json",
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
  "intel-macro": jsonSchemaBody(
    { message: { type: "string", description: "Optional context for logging" } },
    [],
  ),
  "intel-wire": jsonSchemaBody(
    {
      message: { type: "string", description: "Relevance filter for Lounge wire memory" },
      category: { type: "string", description: "Category filter (Macro, Geopolitics, Crypto, …)" },
      limit: { type: "number", description: "Max headlines 1–20 (default 10)" },
    },
    [],
  ),
  "intel-meteora": jsonSchemaBody(
    {
      sortByApy: { type: "boolean", description: "Sort by APY instead of TVL" },
      limit: { type: "number", description: "Max pools 1–20" },
      poolHint: { type: "string", description: "Substring filter on pool name" },
    },
    [],
  ),
  "intel-desk-brief": jsonSchemaBody(
    {
      message: { type: "string", description: "Desk brief context" },
      includeInsider: { type: "boolean", description: "Include Lounge creator signals" },
    },
    [],
  ),
  "intel-a2a-pipeline": jsonSchemaBody(
    {
      message: { type: "string", description: "Desk / orchestration context for downstream agents" },
      includeInsider: { type: "boolean", description: "Include Lounge creator signals in verdict" },
    },
    [],
  ),
  "security-readiness": jsonSchemaBody(
    {
      target: { type: "string", description: "Authorized external https origin (never conc-exe.xyz)" },
      allowlist: { type: "array", items: { type: "string" }, description: "Optional hostname allowlist" },
      authorized: { type: "boolean", description: "Must be true — caller attests permission" },
    },
    ["target", "authorized"],
  ),
  "security-headers": jsonSchemaBody(
    {
      target: { type: "string", description: "Authorized external https origin (never conc-exe.xyz)" },
      allowlist: { type: "array", items: { type: "string" }, description: "Optional hostname allowlist" },
      authorized: { type: "boolean", description: "Must be true — caller attests permission" },
    },
    ["target", "authorized"],
  ),
  "security-scan": jsonSchemaBody(
    {
      target: { type: "string", description: "Authorized external https URL (never conc-exe.xyz)" },
      allowlist: { type: "array", items: { type: "string" }, description: "Hostname allowlist (*.example.com)" },
      authorized: { type: "boolean", description: "Must be true — caller attests permission" },
    },
    ["target", "authorized"],
  ),
  "resource-chat": jsonSchemaBody(
    {
      message: { type: "string", description: "User message (max 4000 chars)" },
      history: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "model"] },
            text: { type: "string" },
          },
          required: ["role", "text"],
        },
      },
    },
    ["message"],
  ),
  "resource-image": jsonSchemaBody(
    { message: { type: "string", description: "Image prompt (max 4000 chars)" } },
    ["message"],
  ),
  "resource-scaffold": jsonSchemaBody(
    { message: { type: "string", description: "Site brief (max 4000 chars)" } },
    ["message"],
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
      // Schema must admit the response example (CDP Bazaar validates example
      // against schema; additionalProperties is false).
      filters: { type: "object" },
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
  "intel-macro": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      marks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            price: { type: "string" },
            change24h: { type: "string" },
          },
        },
      },
      sentiment: {
        type: "object",
        properties: {
          index: { type: "number" },
          label: { type: "string" },
        },
      },
      macro: { type: "object" },
    },
    ["ok"],
  ),
  "intel-wire": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      headlines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            source: { type: "string" },
            category: { type: "string" },
            url: { type: "string" },
            origin: { type: "string", enum: ["live", "lounge"] },
          },
        },
      },
    },
    ["ok", "headlines"],
  ),
  "intel-meteora": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      pools: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            apy: { type: "string" },
            tvlUsd: { type: "string" },
            riskFlags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    ["ok", "pools"],
  ),
  "intel-desk-brief": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      brief: {
        type: "object",
        properties: {
          headline: { type: "string" },
          signal: { type: "string" },
          confidence: { type: "string" },
        },
      },
    },
    ["ok", "brief"],
  ),
  "intel-a2a-pipeline": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      a2a: {
        type: "object",
        properties: {
          handoff: { type: "string", description: "Machine-readable A2A| line" },
          delegate: { type: "array", items: { type: "object" } },
          mesh: { type: "string", format: "uri" },
        },
      },
    },
    ["ok", "a2a"],
  ),
  "security-readiness": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      kind: { type: "string" },
      target: { type: "object" },
      scores: { type: "object" },
      dimensions: { type: "array", items: { type: "object" } },
      disclaimer: { type: "string" },
    },
    ["ok", "kind", "target"],
  ),
  "security-headers": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      kind: { type: "string" },
      target: { type: "object" },
      checks: { type: "array", items: { type: "object" } },
      summary: { type: "object" },
      disclaimer: { type: "string" },
    },
    ["ok", "kind", "target"],
  ),
  "security-scan": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      kind: { type: "string" },
      target: { type: "object" },
      summary: {
        type: "object",
        properties: {
          overallGrade: { type: "string" },
          readinessScore: { type: "number" },
          headersGrade: { type: "string" },
        },
      },
      breakdown: { type: "object" },
      recommendations: { type: "array", items: { type: "string" } },
      disclaimer: { type: "string" },
    },
    ["ok", "kind", "target", "summary"],
  ),
  "resource-chat": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      kind: { type: "string" },
      slug: { type: "string" },
      reply: { type: "string" },
      topics: { type: "array", items: { type: "string" } },
    },
    ["ok", "kind", "reply"],
  ),
  "resource-image": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      kind: { type: "string" },
      prompt: { type: "string" },
      images: { type: "array", items: { type: "string" } },
      count: { type: "integer" },
    },
    ["ok", "kind", "images"],
  ),
  "resource-scaffold": jsonSchemaBody(
    {
      ok: { type: "boolean" },
      kind: { type: "string" },
      slug: { type: "string" },
      title: { type: "string" },
      html: { type: "string" },
    },
    ["ok", "kind", "html"],
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
  "intel-macro": {},
  "intel-wire": { category: "Geopolitics", limit: 8, message: "Middle East oil supply" },
  "intel-meteora": { sortByApy: true, limit: 8, poolHint: "SOL" },
  "intel-desk-brief": { message: "morning Solana desk brief", includeInsider: true },
  "intel-a2a-pipeline": { message: "Solana desk A2A orchestration", includeInsider: true },
  "security-readiness": {
    target: "https://api.example.com",
    allowlist: ["*.example.com"],
    authorized: true,
  },
  "security-headers": {
    target: "https://app.example.com",
    allowlist: ["*.example.com"],
    authorized: true,
  },
  "security-scan": {
    target: "https://api.example.com",
    allowlist: ["*.example.com"],
    authorized: true,
  },
  "resource-chat": {
    message: "Summarize Solana DeFi outlook in 3 bullets",
    history: [],
  },
  "resource-image": {
    message: "Minimal dark dashboard hero — gold accents, abstract market chart",
  },
  "resource-scaffold": {
    message: "Landing page for a crypto intel newsletter — dark theme, hero, pricing, CTA",
  },
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
  "intel-macro": {
    ok: true,
    marks: [{ symbol: "SPX", price: "5,240.10", change24h: "+0.42%" }],
    sentiment: { index: 62, label: "Greed" },
    macro: { upcomingEvents: [{ label: "FOMC decision", when: "2026-03-18" }] },
  },
  "intel-wire": {
    ok: true,
    headlines: [
      {
        title: "Oil supply risk rises on shipping disruption",
        source: "Reuters",
        category: "Geopolitics",
        origin: "lounge",
      },
    ],
  },
  "intel-meteora": {
    ok: true,
    pools: [{ name: "SOL-USDC", apy: "24.50%", tvlUsd: "$12.4M", riskFlags: [] }],
  },
  "intel-desk-brief": {
    ok: true,
    brief: { headline: "Constructive risk-on with Solana yield rotation", signal: "watch", confidence: "medium" },
  },
  "intel-a2a-pipeline": {
    ok: true,
    a2a: {
      schema: "concierge-a2a-v1",
      handoff: "A2A|asset=BTC|class=crypto|tf=24h|bias=neutral|conviction=M|signal=watch|regime=mixed|src=concierge",
      delegate: [
        {
          action: "call",
          target: "concierge",
          endpoint: "https://conc-exe.xyz/api/concierge-intel-wire",
          priceUsdc: 0.02,
          reason: "Neutral desk — scan wire headlines for near-term catalysts",
        },
      ],
      mesh: "https://conc-exe.xyz/api/agent-a2a-mesh",
    },
  },
  "security-readiness": {
    ok: true,
    kind: "security-readiness",
    target: { origin: "https://api.example.com", hostname: "api.example.com" },
    scores: { mean: 2.1, max: 3, dimensions: 4 },
    dimensions: [{ id: "spec-presence", name: "OpenAPI spec presence", score: 2, label: "present" }],
    disclaimer: "Passive audit only — no exploitation.",
  },
  "security-headers": {
    ok: true,
    kind: "security-headers",
    target: { origin: "https://app.example.com", hostname: "app.example.com" },
    summary: { present: 4, total: 6, grade: "moderate" },
    checks: [{ id: "x-content-type-options", header: "x-content-type-options", present: true }],
    disclaimer: "Passive header review only.",
  },
  "security-scan": {
    ok: true,
    kind: "security-scan",
    target: { origin: "https://api.example.com", hostname: "api.example.com" },
    summary: {
      overallGrade: "B",
      readinessScore: 2.1,
      readinessMax: 3,
      headersGrade: "moderate",
      headersPresent: 4,
      headersTotal: 6,
      discoveryFiles: 2,
      mcpReachable: false,
    },
    breakdown: {},
    recommendations: ["Add strict-transport-security — max-age with includeSubDomains on HTTPS"],
    disclaimer: "Passive security breakdown only.",
  },
  "resource-chat": {
    ok: true,
    kind: "resource-chat",
    slug: "resource-chat",
    reply: "<p>Solana DeFi remains constructive…</p>",
    topics: ["crypto", "defi"],
  },
  "resource-image": {
    ok: true,
    kind: "resource-image",
    prompt: "Minimal dark dashboard hero",
    images: ["data:image/png;base64,iVBORw0KGgo="],
    count: 1,
  },
  "resource-scaffold": {
    ok: true,
    kind: "resource-scaffold",
    slug: "crypto-intel-newsletter",
    title: "Crypto Intel Newsletter",
    html: "<!DOCTYPE html><html><head><title>Newsletter</title></head><body></body></html>",
  },
};

export function openApiRequestSchema(kind: X402ResourceKind): Record<string, unknown> {
  return REQUEST_SCHEMAS[kind];
}

export function openApiRequestExample(kind: X402ResourceKind): Record<string, unknown> {
  return REQUEST_BODY_EXAMPLES[kind];
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
  const facilitator = getX402FacilitatorProfile();
  const fallback = getX402FacilitatorFallback();
  return {
    price: { mode: "fixed", currency: "USD", amount },
    protocols: getMppPaymentProtocols(),
    offers: [
      {
        protocol: "x402",
        amount: atomic,
        currency: "USDC",
        intent: "charge",
        description: `$${priceUsd} USDC via ${facilitator.name} (primary; ${fallback.name} fallback on Solana/Base)`,
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
  const facilitator = getX402FacilitatorProfile();
  const fallback = getX402FacilitatorFallback();
  return {
    name: listing.serviceName,
    description: listing.description,
    tags: listing.tags,
    iconUrl: listing.iconUrl,
    protocols: ["x402", "mpp"],
    facilitator: facilitator.name,
    facilitatorUrl: facilitator.url,
    fallbackFacilitator: fallback.name,
    fallbackFacilitatorUrl: fallback.url,
    networks: ["solana", "base", "arbitrum"],
  };
}

export function mppDiscoveryLinks(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    mppscanRegister: MPPSCAN_REGISTER_URL,
    mppscan: MPPSCAN_DEFAULT_SERVER_URL,
    mppscanServer: getMppscanServerUrl() ?? resolveMppscanProfileLink(base),
    mppscanProfileLink: MPPSCAN_DEFAULT_SERVER_URL,
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
  const exampleBody = REQUEST_BODY_EXAMPLES[kind];
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: string[] }>;
  const params: Record<string, unknown>[] = [];
  for (const [name, def] of Object.entries(props)) {
    const param: Record<string, unknown> = {
      name,
      in: "query",
      required: false,
      schema: {
        type: def.type ?? "string",
        ...(def.enum ? { enum: def.enum } : {}),
      },
    };
    if (name in exampleBody) {
      param.example = exampleBody[name as keyof typeof exampleBody];
    }
    params.push(param);
  }
  return params;
}

export const MPP_MARKETPLACE_TAGS = [...X402_SERVICE_TAGS];
