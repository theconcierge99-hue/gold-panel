/**
 * x402scan discovery — https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md
 * Register server: https://www.x402scan.com/resources/register
 */
import type { X402ResourceKind } from "./x402-pricing";
import {
  atomicAmountForResource,
  priceUsdcForResource,
  X402_SIGNAL_PUBLISH_USDC,
} from "./x402-pricing";
import { getMerchantAddresses } from "./x402-config";
import {
  X402_OPERATION_TAGS,
  X402_SERVICE_TAGS,
  x402ServiceListingMeta,
} from "./x402-service-meta";
import {
  buildBazaarExtension,
  buildXPaymentInfo,
  buildXServiceInfo,
  CONCIERGE_OPENAPI_GUIDANCE,
  formatUsdAmountForDiscovery,
  isIntelKindWithGetProbe,
  mppDiscoveryLinks,
  MPPSCAN_REGISTER_URL,
  openApiQueryParameters,
  openApiRequestSchema,
  openApiRequestExample,
  openApiResponseExample,
  openApiResponseSchema,
} from "./mpp-discovery";

export { buildBazaarExtension, buildApiCatalogLinkset, buildAsyncApiDocument };
import { corbitsDiscoveryLinks } from "./corbits-links";
import { dexterDiscoveryLinks } from "./dexter-links";
import { grokDiscoveryLinks } from "./grok-links";
import { payshDiscoveryLinks } from "./paysh-links";
import {
  openApiAgentHeadersParameter,
  openApiComponents,
  openApiIdempotencyParameter,
  openApiStandardErrorResponses,
  buildApiCatalogLinkset,
  buildAsyncApiDocument,
} from "./agent-readiness";
import { getX402FacilitatorProfile, getX402FacilitatorFallback } from "./x402-facilitator";
import { zauthMetaLinks } from "./zauth";

export const X402SCAN_REGISTER_URL = "https://www.x402scan.com/resources/register";
export const X402SCAN_EXPLORE_URL = "https://www.x402scan.com/";

export type X402DiscoveryResource = {
  kind: X402ResourceKind;
  method: "POST";
  path: string;
  name: string;
  description: string;
  priceUsd: string;
  tags: string[];
};

export const X402_DISCOVERY_RESOURCES: X402DiscoveryResource[] = [
  {
    kind: "news",
    method: "POST",
    path: "/api/news-open",
    name: "Open news article",
    description: "Unlock one wire headline and receive the canonical article URL.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS.news],
  },
  {
    kind: "concierge",
    method: "POST",
    path: "/api/concierge",
    name: "Concierge AI message",
    description: "One Concierge AI turn (chat, enhance, or image analysis).",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS.concierge],
  },
  {
    kind: "signal-publish",
    method: "POST",
    path: "/api/lounge-signal-publish",
    name: "Publish creator signal",
    description: "Publish one RWA intelligence signal to the Executive Lounge feed (minimum settlement fee).",
    priceUsd: String(X402_SIGNAL_PUBLISH_USDC.toFixed(2)),
    tags: [...X402_OPERATION_TAGS["signal-publish"]],
  },
  {
    kind: "signal-open",
    method: "POST",
    path: "/api/lounge-signal-open",
    name: "Unlock creator signal",
    description: "Unlock full intelligence summary for one Lounge RWA creator signal.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["signal-open"]],
  },
  {
    kind: "intel-tvl",
    method: "POST",
    path: "/api/concierge-intel-tvl",
    name: "Concierge Intel — TVL",
    description: "Chain TVL snapshot and top DeFi protocols (DeFi Llama). JSON for agents.",
    priceUsd: "0.02",
    tags: [...X402_OPERATION_TAGS["intel-tvl"]],
  },
  {
    kind: "intel-yields",
    method: "POST",
    path: "/api/concierge-intel-yields",
    name: "Concierge Intel — Yields",
    description: "Screened yield pools on Solana/EVM (Jupiter, Meteora, DLMM, major venues).",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-yields"]],
  },
  {
    kind: "intel-whales",
    method: "POST",
    path: "/api/concierge-intel-whales",
    name: "Concierge Intel — Whales",
    description: "Binance top-trader long/short ratios (BTC/ETH/SOL derivatives proxy).",
    priceUsd: "0.02",
    tags: [...X402_OPERATION_TAGS["intel-whales"]],
  },
  {
    kind: "intel-wallet",
    method: "POST",
    path: "/api/concierge-intel-wallet",
    name: "Concierge Intel — Wallet",
    description: "Wallet snapshot for Solana (Helius) or EVM address acknowledgment.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-wallet"]],
  },
  {
    kind: "intel-verdict",
    method: "POST",
    path: "/api/concierge-intel-verdict",
    name: "Concierge Intel — Verdict",
    description: "Structured desk verdict with Fear & Greed, positioning, yields, and optional Lounge insider signals.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-verdict"]],
  },
  {
    kind: "intel-airdrop",
    method: "POST",
    path: "/api/concierge-intel-airdrop",
    name: "Concierge Intel — Airdrop",
    description: "Potential airdrop candidates — Lounge insider signals first, institutional/onchain/narrative/KOL overlay.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-airdrop"]],
  },
  {
    kind: "intel-listing",
    method: "POST",
    path: "/api/concierge-intel-listing",
    name: "Concierge Intel — Listing",
    description: "Potential exchange listing candidates — insider-first alpha desk synthesis for agents.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-listing"]],
  },
  {
    kind: "intel-momentum",
    method: "POST",
    path: "/api/concierge-intel-momentum",
    name: "Concierge Intel — Momentum",
    description: "Large-move candidates (up or down) — insider, derivatives positioning, narrative synthesis.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-momentum"]],
  },
  {
    kind: "intel-scalp",
    method: "POST",
    path: "/api/concierge-intel-scalp",
    name: "Concierge Intel — Scalp",
    description: "BTC/ETH/BNB/SOL USDT scalping desk — 5m & 15m Binance klines, RSI/EMA, perp overlay for agents.",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-scalp"]],
  },
  {
    kind: "intel-macro",
    method: "POST",
    path: "/api/concierge-intel-macro",
    name: "Concierge Intel — Macro",
    description: "Macro snapshot — SPX, VIX, DXY, gold, BTC/ETH marks, Fear & Greed, Treasury yields, and central-bank calendar.",
    priceUsd: "0.02",
    tags: [...X402_OPERATION_TAGS["intel-macro"]],
  },
  {
    kind: "intel-wire",
    method: "POST",
    path: "/api/concierge-intel-wire",
    name: "Concierge Intel — Wire",
    description: "Wire headline digest — live RSS plus persisted Lounge feed; optional category or message filter.",
    priceUsd: "0.02",
    tags: [...X402_OPERATION_TAGS["intel-wire"]],
  },
  {
    kind: "intel-meteora",
    method: "POST",
    path: "/api/concierge-intel-meteora",
    name: "Concierge Intel — Meteora DLMM",
    description: "Meteora DLMM pool deep-dive — TVL, APY, bin step, volume, IL risk flags (Solana-native moat).",
    priceUsd: "0.10",
    tags: [...X402_OPERATION_TAGS["intel-meteora"]],
  },
  {
    kind: "intel-desk-brief",
    method: "POST",
    path: "/api/concierge-intel-desk-brief",
    name: "Concierge Intel — Desk brief",
    description: "Composite brief — macro + Meteora yields + desk verdict + optional Lounge insider overlay.",
    priceUsd: "0.25",
    tags: [...X402_OPERATION_TAGS["intel-desk-brief"]],
  },
];

/** Canonical public origin for discovery URLs (production domain). */
export function resolveX402SiteOrigin(request?: Request): string {
  const explicit = process.env.X402_SITE_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (request) {
    const host = request.headers.get("host");
    if (host) {
      const proto = request.headers.get("x-forwarded-proto") || "https";
      return `${proto}://${host}`;
    }
  }

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "")}`;

  return "https://conc-exe.xyz";
}

export function resourceUrlForOrigin(origin: string, kind: X402ResourceKind): string {
  const def = X402_DISCOVERY_RESOURCES.find((r) => r.kind === kind);
  return `${origin.replace(/\/$/, "")}${def?.path ?? `/api/${kind}`}`;
}

export function listDiscoveryResourceUrls(origin: string): string[] {
  const base = origin.replace(/\/$/, "");
  return X402_DISCOVERY_RESOURCES.map((r) => `${base}${r.path}`);
}

export function ownershipProofs(): string[] {
  const proofs: string[] = [];
  const fromEnv = process.env.X402_OWNERSHIP_PROOFS?.split(",").map((s) => s.trim()) ?? [];
  for (const p of fromEnv) {
    if (p) proofs.push(p);
  }
  const { evm } = getMerchantAddresses();
  if (evm && !proofs.includes(evm)) proofs.push(evm);
  return proofs;
}

export function buildWellKnownX402Document(origin: string): Record<string, unknown> {
  const proofs = ownershipProofs();
  const listing = x402ServiceListingMeta(origin);
  const facilitator = getX402FacilitatorProfile();
  return {
    version: 1,
    resources: listDiscoveryResourceUrls(origin),
    ...(proofs.length ? { ownershipProofs: proofs } : {}),
    serviceName: listing.serviceName,
    description: listing.description,
    tags: listing.tags,
    iconUrl: listing.iconUrl,
    instructions:
      "Concierge Agent — fifteen pay-per-call routes (Concierge AI, macro & wire research, DeFi intel, Alpha desks, Lounge). x402 + MPP discovery; USDC settlement via PayAI (primary) with Dexter fallback on Solana/Base. OpenDexter auto-discovery on Dexter settlements; also on MPPscan, pay.sh CLI, x402scan.",
    links: {
      openapi: `${origin.replace(/\/$/, "")}/openapi.json`,
      x402scanRegister: X402SCAN_REGISTER_URL,
      x402scan: X402SCAN_EXPLORE_URL,
      mppscanRegister: MPPSCAN_REGISTER_URL,
      ...mppDiscoveryLinks(origin),
      ...dexterDiscoveryLinks(origin),
      ...payshDiscoveryLinks(origin),
      ...grokDiscoveryLinks(origin),
      corbits: corbitsDiscoveryLinks(),
      zauth: zauthMetaLinks(origin),
    },
  };
}

function openApiOperation(
  resource: X402DiscoveryResource,
  origin: string,
  method: "post" | "get",
): Record<string, unknown> {
  const url = `${origin.replace(/\/$/, "")}${resource.path}`;
  const kind = resource.kind;
  const opSuffix = method === "get" ? "_get" : "";
  const standardErrors = openApiStandardErrorResponses();
  const op: Record<string, unknown> = {
    operationId: `${resource.kind.replace(/-/g, "_")}${opSuffix}`,
    summary:
      method === "get" && isIntelKindWithGetProbe(kind)
        ? `${resource.name} (GET probe)`
        : resource.name,
    description:
      method === "get" && isIntelKindWithGetProbe(kind)
        ? `${resource.description} Probes return 402 without payment; use POST with JSON body after settlement.`
        : resource.description,
    "x-payment-info": buildXPaymentInfo(resource.priceUsd, kind),
    tags: resource.tags,
    parameters: [openApiAgentHeadersParameter()],
    security: [{ x402Payment: [] }],
    responses: {
      ...standardErrors,
      "200": {
        description: "Success after payment",
        content: {
          "application/json": {
            schema: openApiResponseSchema(kind),
            example: openApiResponseExample(kind),
          },
        },
      },
      "402": {
        description: "Payment Required",
        headers: {
          "PAYMENT-REQUIRED": {
            description: "Base64 JSON x402 payment requirements (MPP-compatible)",
            schema: { type: "string" },
          },
          "X-RateLimit-Limit": {
            description: "Soft rate limit per IP per minute",
            schema: { type: "integer", example: 120 },
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
            example: {
              error: "Payment required",
              code: "payment_required",
              priceUsdc: Number(resource.priceUsd),
              resource: kind,
            },
          },
        },
      },
    },
    servers: [{ url }],
  };

  if (method === "post") {
    op.parameters = [...(op.parameters as Record<string, unknown>[]), openApiIdempotencyParameter()];
    op.requestBody = {
      required: kind !== "intel-tvl",
      content: {
        "application/json": {
          schema: openApiRequestSchema(kind),
          example: openApiRequestExample(kind),
        },
      },
    };
  } else if (isIntelKindWithGetProbe(kind)) {
    op.parameters = [...(op.parameters as Record<string, unknown>[]), ...openApiQueryParameters(kind)];
  }

  return op;
}

function openApiPathItem(resource: X402DiscoveryResource, origin: string): Record<string, unknown> {
  const pathItem: Record<string, unknown> = {
    post: openApiOperation(resource, origin, "post"),
  };
  if (isIntelKindWithGetProbe(resource.kind)) {
    pathItem.get = openApiOperation(resource, origin, "get");
  }
  return pathItem;
}

export function buildOpenApiDocument(origin: string): Record<string, unknown> {
  const base = origin.replace(/\/$/, "");
  const paths: Record<string, unknown> = {};
  for (const r of X402_DISCOVERY_RESOURCES) {
    paths[r.path] = openApiPathItem(r, base);
  }

  const proofs = ownershipProofs();
  const listing = x402ServiceListingMeta(base);
  const facilitator = getX402FacilitatorProfile();

  return {
    openapi: "3.1.0",
    info: {
      title: "Concierge Agent API",
      version: "4.0.0",
      description:
        "Market intelligence as a service — fifteen pay-per-call endpoints. Concierge AI, macro & wire research, DeFi intel, Alpha desks, and Lounge RWA signals. No API keys. x402 + MPP discovery; USDC settlement on Solana and Base via PayAI (primary) with Dexter fallback.",
      "x-guidance": CONCIERGE_OPENAPI_GUIDANCE,
      "x-marketplace-tags": [...X402_SERVICE_TAGS],
      contact: {
        name: "Concierge Agent",
        url: `${base}/docs`,
        email: "support@conc-exe.xyz",
      },
    },
    "x-service-info": buildXServiceInfo(base),
    servers: [{ url: base, description: "Concierge Agent" }],
    paths,
    "x-discovery": {
      ownershipProofs: proofs,
      x402scan: X402SCAN_REGISTER_URL,
      mppscan: MPPSCAN_REGISTER_URL,
      ...mppDiscoveryLinks(base),
      ...dexterDiscoveryLinks(base),
      ...payshDiscoveryLinks(base),
      serviceName: listing.serviceName,
      description: listing.description,
      tags: listing.tags,
      iconUrl: listing.iconUrl,
      facilitator: facilitator.name,
      facilitatorUrl: facilitator.url,
      fallbackFacilitator: getX402FacilitatorFallback().name,
      fallbackFacilitatorUrl: getX402FacilitatorFallback().url,
      protocols: ["x402", "mpp"],
    },
    tags: [
      { name: "news", description: "Wire article unlock" },
      { name: "concierge", description: "Concierge AI" },
      { name: "intel", description: "Concierge DeFi intelligence APIs" },
      { name: "research", description: "Macro snapshot and wire headline digest" },
      { name: "creator", description: "Creator signals & RWA" },
      { name: "rwa", description: "Real World Asset intelligence certificates" },
    ],
    components: openApiComponents(),
  };
}

export function discoveryMetaForConfig(origin: string) {
  const base = origin.replace(/\/$/, "");
  const listing = x402ServiceListingMeta(base);
  const facilitator = getX402FacilitatorProfile();
  return {
    siteOrigin: base,
    serviceName: listing.serviceName,
    serviceDescription: listing.description,
    serviceTags: listing.tags,
    serviceIconUrl: listing.iconUrl,
    wellKnownUrl: `${base}/.well-known/x402`,
    openApiUrl: `${base}/openapi.json`,
    resourceUrls: listDiscoveryResourceUrls(base),
    x402scanRegisterUrl: X402SCAN_REGISTER_URL,
    x402scanExploreUrl: X402SCAN_EXPLORE_URL,
    zauth: zauthMetaLinks(base),
    ownershipProofs: ownershipProofs(),
    protocols: ["x402", "mpp"],
    facilitator: facilitator.name,
    facilitatorId: facilitator.id,
    facilitatorUrl: facilitator.url,
    fallbackFacilitator: getX402FacilitatorFallback().name,
    fallbackFacilitatorUrl: getX402FacilitatorFallback().url,
    mppscanRegisterUrl: MPPSCAN_REGISTER_URL,
    resources: X402_DISCOVERY_RESOURCES.map((r) => ({
      kind: r.kind,
      url: `${base}${r.path}`,
      method: r.method,
      priceUsd: r.priceUsd,
      priceUsdDiscovery: formatUsdAmountForDiscovery(r.priceUsd),
      atomicAmount: atomicAmountForResource(r.kind),
      priceUsdc: priceUsdcForResource(r.kind),
    })),
    ...mppDiscoveryLinks(base),
    ...dexterDiscoveryLinks(base),
    ...payshDiscoveryLinks(base),
    corbits: corbitsDiscoveryLinks(),
  };
}

export function discoveryCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}
