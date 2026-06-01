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
    description: "Publish one RWA intelligence signal to the Executive Lounge feed (anti-spam fee).",
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
  return {
    version: 1,
    resources: listDiscoveryResourceUrls(origin),
    ...(proofs.length ? { ownershipProofs: proofs } : {}),
    serviceName: listing.serviceName,
    description: listing.description,
    tags: listing.tags,
    iconUrl: listing.iconUrl,
    instructions:
      "Executive Lounge x402 resources (RWA signals, Concierge AI, market wire). Settlements on-chain via PayAI. Index at x402scan.com after probing POST (402 + PAYMENT-REQUIRED).",
    links: {
      openapi: `${origin.replace(/\/$/, "")}/openapi.json`,
      x402scanRegister: X402SCAN_REGISTER_URL,
      x402scan: X402SCAN_EXPLORE_URL,
      zauth: zauthMetaLinks(origin),
    },
  };
}

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

/** Bazaar extension so x402scan can invoke and index paid routes. */
export function buildBazaarExtension(kind: X402ResourceKind): Record<string, unknown> {
  const examples: Record<X402ResourceKind, { body: Record<string, unknown>; schema: Record<string, unknown> }> =
    {
      news: {
        body: {
          url: "https://www.bbc.com/news/example",
          title: "Example headline",
          source: "BBC",
        },
        schema: jsonSchemaBody(
          {
            url: { type: "string", description: "Article URL (http/https)" },
            title: { type: "string", description: "Headline title" },
            source: { type: "string", description: "Publisher name" },
          },
          ["url"],
        ),
      },
      concierge: {
        body: {
          mode: "chat",
          message: "What is the macro outlook for BTC?",
          history: [],
          market: [],
        },
        schema: jsonSchemaBody(
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
      },
      "signal-publish": {
        body: {
          title: "BTC dominance roll-down thesis",
          summary:
            "Dominance stalled at resistance while ETH/BTC prints higher lows; positioning favors risk-curve rotation over the next 1–2 weeks.",
          categories: ["Crypto", "Macro"],
          creatorWallet: "0x0000000000000000000000000000000000000000",
          creatorChain: "evm",
        },
        schema: jsonSchemaBody(
          {
            title: { type: "string" },
            summary: { type: "string" },
            categories: { type: "array", items: { type: "string" } },
            creatorWallet: { type: "string" },
            creatorChain: { type: "string", enum: ["sol", "evm"] },
          },
          ["title", "summary", "categories", "creatorWallet", "creatorChain"],
        ),
      },
      "signal-open": {
        body: { signalId: "sig_example000000000000000000000000" },
        schema: jsonSchemaBody(
          { signalId: { type: "string", description: "Published signal id" } },
          ["signalId"],
        ),
      },
    };

  const ex = examples[kind];
  const input = {
    type: "http",
    method: "POST",
    bodyType: "json",
    body: ex.body,
    headers: { "Content-Type": "application/json" },
  };

  return {
    bazaar: {
      info: {
        input,
        output: {
          type: "json",
          example:
            kind === "news"
              ? { url: "https://www.bbc.com/news/example", unlocked: true }
              : kind === "concierge"
                ? { reply: "<p>Analysis…</p>", topics: ["crypto"] }
                : kind === "signal-publish"
                  ? { id: "sig_…", published: true }
                  : { signalId: "sig_…", summary: "Full thesis…" },
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { const: "http" },
              method: { const: "POST" },
              bodyType: { const: "json" },
              body: ex.schema,
              headers: { type: "object" },
            },
            required: ["type", "method", "bodyType", "body"],
          },
          output: { type: "object" },
        },
        required: ["input", "output"],
      },
    },
  };
}

function paymentInfoForPrice(amount: string): Record<string, unknown> {
  return {
    protocols: ["x402"],
    price: { mode: "fixed", currency: "USD", amount },
  };
}

function openApiPathItem(resource: X402DiscoveryResource, origin: string): Record<string, unknown> {
  const url = `${origin.replace(/\/$/, "")}${resource.path}`;
  return {
    post: {
      operationId: resource.kind.replace(/-/g, "_"),
      summary: resource.name,
      description: resource.description,
      "x-payment-info": paymentInfoForPrice(resource.priceUsd),
      tags: resource.tags,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
      responses: {
        "200": {
          description: "Success after payment",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "402": {
          description: "Payment required (x402 v2 — PAYMENT-REQUIRED header)",
          headers: {
            "PAYMENT-REQUIRED": {
              description: "Base64 JSON x402 payment requirements",
              schema: { type: "string" },
            },
          },
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string" },
                  priceUsdc: { type: "number" },
                  resource: { type: "string" },
                },
              },
            },
          },
        },
      },
      servers: [{ url }],
    },
  };
}

export function buildOpenApiDocument(origin: string): Record<string, unknown> {
  const base = origin.replace(/\/$/, "");
  const paths: Record<string, unknown> = {};
  for (const r of X402_DISCOVERY_RESOURCES) {
    paths[r.path] = openApiPathItem(r, base);
  }

  const proofs = ownershipProofs();
  const listing = x402ServiceListingMeta(base);

  return {
    openapi: "3.1.0",
    info: {
      title: "Executive Lounge — Private Intelligence Lobby",
      version: "2.0.1",
      description:
        "Micropayment-gated resources for Executive Lounge: market wire, RWA creator signals (Solana NFT), and Concierge AI. Discoverable on x402scan.com. USDC on Base and Solana via PayAI facilitator.",
      "x-marketplace-tags": [...X402_SERVICE_TAGS],
    },
    servers: [{ url: base, description: "Executive Lounge" }],
    paths,
    "x-discovery": {
      ownershipProofs: proofs,
      x402scan: X402SCAN_REGISTER_URL,
      serviceName: listing.serviceName,
      description: listing.description,
      tags: listing.tags,
      iconUrl: listing.iconUrl,
    },
    tags: [
      { name: "news", description: "Wire article unlock" },
      { name: "concierge", description: "Concierge AI" },
      { name: "creator", description: "Creator signals & RWA" },
      { name: "rwa", description: "Real World Asset intelligence certificates" },
    ],
  };
}

export function discoveryMetaForConfig(origin: string) {
  const base = origin.replace(/\/$/, "");
  const listing = x402ServiceListingMeta(base);
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
    resources: X402_DISCOVERY_RESOURCES.map((r) => ({
      kind: r.kind,
      url: `${base}${r.path}`,
      method: r.method,
      priceUsd: r.priceUsd,
      atomicAmount: atomicAmountForResource(r.kind),
      priceUsdc: priceUsdcForResource(r.kind),
    })),
  };
}

export function discoveryCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}
