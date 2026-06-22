/**
 * Agent-readiness signals — api-evangelist/agent-readiness dimension helpers.
 * @see https://github.com/api-evangelist/agent-readiness
 */

/** Documented soft limit per IP (abuse protection; see LIMITS in concierge-security). */
export const AGENT_RATE_LIMIT = {
  limitPerMinute: 120,
  windowSeconds: 60,
} as const;

export type RateLimitState = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_LIMIT_BUCKETS = 8_000;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function pruneRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (now >= bucket.resetAt) rateLimitBuckets.delete(key);
  }
  if (rateLimitBuckets.size <= MAX_RATE_LIMIT_BUCKETS) return;
  const overflow = rateLimitBuckets.size - MAX_RATE_LIMIT_BUCKETS;
  const keys = [...rateLimitBuckets.keys()].slice(0, overflow);
  for (const key of keys) rateLimitBuckets.delete(key);
}

/** Soft per-IP sliding window — Edge-safe in-memory (per isolate). */
export function checkApiRateLimit(request: Request): RateLimitState {
  if (request.method === "OPTIONS") {
    return {
      allowed: true,
      remaining: AGENT_RATE_LIMIT.limitPerMinute,
      retryAfter: AGENT_RATE_LIMIT.windowSeconds,
    };
  }

  const ip = clientIp(request);
  const now = Date.now();
  const windowMs = AGENT_RATE_LIMIT.windowSeconds * 1000;
  let bucket = rateLimitBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateLimitBuckets.set(ip, bucket);
  }

  bucket.count += 1;
  pruneRateLimitBuckets();

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const remaining = Math.max(0, AGENT_RATE_LIMIT.limitPerMinute - bucket.count);
  if (bucket.count > AGENT_RATE_LIMIT.limitPerMinute) {
    return { allowed: false, remaining: 0, retryAfter };
  }
  return { allowed: true, remaining, retryAfter };
}

export function agentRateLimitHeaders(state?: RateLimitState): Record<string, string> {
  const remaining = state?.remaining ?? AGENT_RATE_LIMIT.limitPerMinute;
  const retryAfter = state?.retryAfter ?? AGENT_RATE_LIMIT.windowSeconds;
  return {
    "X-RateLimit-Limit": String(AGENT_RATE_LIMIT.limitPerMinute),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Policy": `${AGENT_RATE_LIMIT.limitPerMinute};w=${AGENT_RATE_LIMIT.windowSeconds}`,
    "RateLimit-Limit": String(AGENT_RATE_LIMIT.limitPerMinute),
    "RateLimit-Remaining": String(remaining),
    "Retry-After": String(retryAfter),
  };
}

export function agentDiscoveryLinkHeader(origin: string): Record<string, string> {
  const base = origin.replace(/\/$/, "");
  return {
    Link: `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
    "Signature-Agent": `${base}/docs/api/agent-identity`,
  };
}

/** Merge machine-readable agent headers onto API responses (non-destructive). */
export function mergeAgentReadinessHeaders(
  base: Record<string, string>,
  origin?: string,
  rateLimit?: RateLimitState,
): Record<string, string> {
  return {
    ...base,
    ...agentRateLimitHeaders(rateLimit),
    ...(origin ? agentDiscoveryLinkHeader(origin) : {}),
  };
}

export function rateLimitedJsonResponse(
  request: Request,
  rateLimit: RateLimitState,
): Response {
  const origin = siteOriginFromRequest(request);
  const headers = mergeAgentReadinessHeaders(
    { "Content-Type": "application/json", "Cache-Control": "no-store" },
    origin,
    rateLimit,
  );
  return new Response(
    JSON.stringify({
      error: "Too many requests — retry after the Retry-After interval",
      code: "rate_limited",
    }),
    { status: 429, headers },
  );
}

export function siteOriginFromRequest(request: Request): string {
  const host = request.headers.get("host") || "conc-exe.xyz";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export const OPENAPI_API_ERROR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: { type: "string", description: "Human-readable error message" },
    code: {
      type: "string",
      description: "Stable machine-readable error code when available",
      enum: [
        "invalid_request",
        "payment_required",
        "payment_failed",
        "rate_limited",
        "method_not_allowed",
        "not_found",
        "internal_error",
      ],
    },
    detail: { type: "string", description: "Additional context (may mirror error in dev)" },
    resource: { type: "string", description: "x402 resource kind when payment-related" },
    priceUsdc: { type: "number", description: "Quoted USDC price on 402 responses" },
  },
} as const;

export function openApiErrorResponse(description: string, example: Record<string, unknown>) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" },
        example,
      },
    },
  };
}

/** Standard error responses appended to every OpenAPI operation. */
export function openApiStandardErrorResponses(): Record<string, unknown> {
  return {
    "400": openApiErrorResponse("Invalid request body or parameters", {
      error: "Invalid JSON body",
      code: "invalid_request",
    }),
    "405": openApiErrorResponse("HTTP method not allowed", {
      error: "Method not allowed",
      code: "method_not_allowed",
    }),
    "429": {
      description: "Rate limit exceeded — back off and retry after Retry-After seconds",
      headers: {
        "Retry-After": {
          description: "Seconds until the client may retry",
          schema: { type: "integer", example: 60 },
        },
        "X-RateLimit-Limit": {
          description: "Maximum requests per window",
          schema: { type: "integer", example: AGENT_RATE_LIMIT.limitPerMinute },
        },
        "X-RateLimit-Remaining": {
          description: "Requests remaining (0 when rate limited)",
          schema: { type: "integer", example: 0 },
        },
        "RateLimit-Remaining": {
          description: "Requests remaining (0 when rate limited)",
          schema: { type: "integer", example: 0 },
        },
      },
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiError" },
          example: {
            error: "Too many requests — retry after the Retry-After interval",
            code: "rate_limited",
          },
        },
      },
    },
    "500": openApiErrorResponse("Internal server error", {
      error: "Concierge could not process this request. Try a shorter question.",
      code: "internal_error",
    }),
  };
}

export function openApiIdempotencyParameter(): Record<string, unknown> {
  return {
    name: "Idempotency-Key",
    in: "header",
    required: false,
    description:
      "Optional client-generated key (UUID recommended). Reuse the same key when retrying after network failures. " +
      "For paid routes, also reuse the same PAYMENT-SIGNATURE — facilitators treat a settled payment as idempotent.",
    schema: { type: "string", maxLength: 128, example: "550e8400-e29b-41d4-a716-446655440000" },
  };
}

export function openApiAgentHeadersParameter(): Record<string, unknown> {
  return {
    name: "X-Agent-Id",
    in: "header",
    required: false,
    description: "Registered agent identity (agt_…) for attribution and discovery",
    schema: { type: "string", pattern: "^agt_[a-zA-Z0-9]+$", example: "agt_demo0001" },
  };
}

export function openApiComponents(): Record<string, unknown> {
  return {
    schemas: {
      ApiError: OPENAPI_API_ERROR_SCHEMA,
    },
    securitySchemes: {
      x402Payment: {
        type: "apiKey",
        in: "header",
        name: "PAYMENT-SIGNATURE",
        description:
          "Base64 x402 payment payload after USDC settlement. Omit on first request to receive 402 + PAYMENT-REQUIRED.",
      },
      soonHolder: {
        type: "apiKey",
        in: "header",
        name: "X-Soon-Holder-Wallet",
        description:
          "Post-launch: Solana wallet with SOON Deluxe balance for free raw-tier intel calls (no PAYMENT-SIGNATURE).",
      },
    },
  };
}

/** RFC 9727 / RFC 9264 linkset — canonical machine entrypoint for agents. */
export function buildApiCatalogLinkset(origin: string): Record<string, unknown> {
  const base = origin.replace(/\/$/, "");
  return {
    linkset: [
      {
        anchor: base,
        title: "Concierge Agent",
        description: "Pay-per-call market intelligence API for AI agents",
        "service-desc": [
          {
            href: `${base}/openapi.json`,
            type: "application/vnd.oai.openapi+json;version=3.1",
          },
        ],
        "service-doc": [{ href: `${base}/docs`, type: "text/html" }],
        describedby: [{ href: `${base}/llms.txt`, type: "text/plain" }],
      },
      {
        anchor: `${base}/api/mcp`,
        title: "Concierge Intel MCP",
        description: "HTTP JSON-RPC MCP — tools/list and tools/call for all intel routes",
        "service-desc": [{ href: `${base}/openapi.json`, type: "application/json" }],
        describedby: [
          {
            href: "https://registry.modelcontextprotocol.io/?search=xyz.conc-exe%2Fconcierge-intel",
            type: "text/html",
            title: "Official MCP Registry listing (xyz.conc-exe/concierge-intel v1.0.1)",
          },
        ],
      },
      {
        anchor: `${base}/api/concierge-intel-accuracy`,
        title: "Verdict accuracy leaderboard",
        description: "Free trust signal — scored intel-verdict track record vs 24h BTC move",
        "service-desc": [{ href: `${base}/openapi.json`, type: "application/json" }],
        "service-doc": [{ href: `${base}/docs/builders/case-study`, type: "text/html" }],
      },
      {
        anchor: `${base}/.well-known/x402`,
        title: "x402 discovery",
        description: "x402 resource fan-out for x402scan and CDP Bazaar",
      },
      {
        anchor: `${base}/.well-known/agent-card.json`,
        title: "Agent service card",
        description: "ERC-8004-style A2A discovery card",
      },
      {
        anchor: `${base}/asyncapi.json`,
        title: "AsyncAPI stub",
        description: "Event surface contract (webhooks planned; HTTP-only today)",
        "service-desc": [{ href: `${base}/asyncapi.json`, type: "application/json" }],
      },
    ],
  };
}

/** Minimal AsyncAPI 2.6 — documents that events are not yet published (agent contract placeholder). */
export function buildAsyncApiDocument(origin: string): Record<string, unknown> {
  const base = origin.replace(/\/$/, "");
  return {
    asyncapi: "2.6.0",
    info: {
      title: "Concierge Agent Events",
      version: "1.0.0",
      description:
        "Concierge is HTTP request/response today. This contract reserves channel names for future webhook " +
        "subscriptions (signal published, verdict updates). Subscribe via OpenAPI + MCP until events ship.",
      "x-guidance": `No webhook endpoints are live yet. Poll ${base}/api/concierge-intel-accuracy or use MCP tools.`,
    },
    defaultContentType: "application/json",
    servers: {
      production: { url: base, protocol: "https", description: "HTTP API (active)" },
    },
    channels: {},
    components: {
      messages: {},
    },
  };
}

/** Free GET — documented in OpenAPI for agent trust / procurement probes. */
export function openApiIntelAccuracyPathItem(origin: string): Record<string, unknown> {
  const base = origin.replace(/\/$/, "");
  return {
    get: {
      operationId: "getConciergeIntelAccuracy",
      summary: "Verdict accuracy leaderboard (free)",
      description:
        "Public trust signal scoring paid intel-verdict snapshots against 24h BTC price move. " +
        "No x402 payment required. Poll before routing agents to intel-verdict or for procurement due diligence.",
      tags: ["intel"],
      parameters: [openApiAgentHeadersParameter()],
      requestBody: {
        required: false,
        description: "No body required — free GET endpoint.",
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: false, maxProperties: 0 },
            example: {},
          },
        },
      },
      externalDocs: {
        description: "B2B integration case study",
        url: `${base}/docs/builders/case-study`,
      },
      responses: {
        "200": {
          description: "Accuracy leaderboard — evaluated counts, hit rate, recent snapshots",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IntelAccuracyResponse" },
              example: {
                ok: true,
                dataAsOf: "2026-06-20T12:00:00.000Z",
                methodology:
                  "Each paid intel-verdict records BTC mark + signal. After 24h, hit if snipe/follow + BTC ≥+1%, avoid + BTC ≤−1%, watch/rebalance if |move| <2%.",
                evaluated: { total: 12, hits: 8, misses: 4, inconclusive: 0, hitRatePct: 66.7 },
                bySignal: {
                  snipe: { total: 4, hits: 3, hitRatePct: 75 },
                  watch: { total: 3, hits: 2, hitRatePct: 66.7 },
                },
                recent: [],
              },
            },
          },
        },
        ...openApiStandardErrorResponses(),
      },
    },
  };
}

export function openApiIntelAccuracySchemas(): Record<string, unknown> {
  return {
    IntelAccuracyResponse: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "dataAsOf", "methodology", "evaluated", "bySignal", "recent"],
      properties: {
        ok: { type: "boolean", const: true },
        dataAsOf: { type: "string", format: "date-time" },
        methodology: { type: "string" },
        evaluated: {
          type: "object",
          properties: {
            total: { type: "integer" },
            hits: { type: "integer" },
            misses: { type: "integer" },
            inconclusive: { type: "integer" },
            hitRatePct: { type: ["number", "null"] },
          },
        },
        bySignal: { type: "object", additionalProperties: true },
        recent: { type: "array", items: { type: "object", additionalProperties: true } },
      },
    },
  };
}
