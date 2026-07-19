/**
 * x402 payment gate via facilitator HTTP API (Edge-safe).
 * Primary: PayAI by default. Optional CDP/Dexter primary with EVM fallback.
 */
import {
  getMerchantAddresses,
  getX402EvmAcceptNetworks,
  getX402NetworkProfile,
  getUsdcAssetForNetwork,
  getUsdcEip712ExtraForNetwork,
  isRobinhoodNetwork,
  isX402Enabled,
} from "./x402-config";
import {
  getX402FacilitatorProfile,
  getX402FacilitatorFallback,
  getRobinhoodFacilitatorProfile,
  resolveFacilitatorForSolanaFeePayer,
  PAYAI_FACILITATOR,
  DEXTER_FACILITATOR,
  type X402FacilitatorProfile,
} from "./x402-facilitator";
import { corsHeadersFor } from "./concierge-security";
import { loungeApiOrigin } from "./lounge-internal-auth";
import { buildBazaarExtension } from "./x402-discovery";
import { priceUsdcForResource, atomicAmountForResource, priceLabelForResource, type X402ResourceKind } from "./x402-pricing";
import { x402ServiceListingMeta } from "./x402-service-meta";
import {
  buildTokenPayAcceptsForResourceAsync,
  formatTokenPayPriceLabelsForResourceAsync,
} from "./token-pay";
import {
  isTokenPaySelfSettleRequirement,
  resolveTokenPayMatchedAccept,
  verifyAndSettleTokenPaySelf,
  type TokenPayPaymentPayload,
} from "./token-pay";
import { trySoonHolderFreeTier } from "./soon-holder-free-tier";
import { trySoonSecurityFreeTier } from "./soon-security-tier";
import { tryTcxCreditsSettlement } from "./tcx-credits-settle";
import { verifyOobeSapSettlement } from "./oobe-sap-x402";

export type { X402ResourceKind };

const RESOURCE_META: Record<
  X402ResourceKind,
  { name: string; description: string; mimeType: string; tags: string[] }
> = {
  news: {
    name: "Concierge Agent — Open article",
    description: "Open one news article (full story link)",
    mimeType: "application/json",
    tags: ["executive-lounge", "news", "markets"],
  },
  concierge: {
    name: "Concierge Agent — Concierge AI",
    description: "Concierge AI chat turn (single request)",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge"],
  },
  "signal-publish": {
    name: "Concierge Agent — Publish signal",
    description: "Publish one RWA intelligence signal to the Lounge (minimum settlement fee; Solana NFT mint in Phantom)",
    mimeType: "application/json",
    tags: ["executive-lounge", "creator", "signals", "rwa"],
  },
  "signal-open": {
    name: "Concierge Agent — Unlock signal",
    description: "Unlock one creator RWA signal (full intelligence summary)",
    mimeType: "application/json",
    tags: ["executive-lounge", "creator", "signals", "rwa"],
  },
  "intel-tvl": {
    name: "Concierge Intel — TVL",
    description: "DeFi TVL by chain and top protocols (DeFi Llama)",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "tvl"],
  },
  "intel-yields": {
    name: "Concierge Intel — Yields",
    description: "Screened yield pools (Jupiter, Meteora, DLMM, major DEX/lending venues)",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "yield"],
  },
  "intel-whales": {
    name: "Concierge Intel — Whales",
    description: "Top-trader long/short positioning proxy (Binance futures)",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "whales"],
  },
  "intel-wallet": {
    name: "Concierge Intel — Wallet",
    description: "Solana wallet token snapshot (Helius when configured) or EVM address ack",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "wallet"],
  },
  "intel-verdict": {
    name: "Concierge Intel — Verdict",
    description: "Desk verdict (snipe/watch/follow/avoid/rebalance) with insider creator-signal overlay",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "verdict"],
  },
  "intel-airdrop": {
    name: "Concierge Intel — Airdrop",
    description: "Potential airdrop candidates — insider Lounge signals first, then institutional/onchain/narrative overlay",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "alpha"],
  },
  "intel-listing": {
    name: "Concierge Intel — Listing",
    description: "Potential exchange listing candidates — insider-first multi-source alpha desk",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "alpha"],
  },
  "intel-momentum": {
    name: "Concierge Intel — Momentum",
    description:
      "Large-move candidates (up or down). Optional theme:robinhood for Robinhood Chain meme rotation via Pump.fun SOL routing.",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "alpha"],
  },
  "intel-scalp": {
    name: "Concierge Intel — Scalp",
    description: "BTC/ETH/BNB/SOL USDT scalping desk — 5m & 15m klines, RSI/EMA, perp funding & positioning",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "trading"],
  },
  "intel-macro": {
    name: "Concierge Intel — Macro",
    description: "Macro snapshot — SPX, VIX, DXY, gold, BTC/ETH marks, Fear & Greed, Treasury yields, central-bank calendar",
    mimeType: "application/json",
    tags: ["executive-lounge", "research", "macro", "news"],
  },
  "intel-wire": {
    name: "Concierge Intel — Wire",
    description: "Wire headline digest — live RSS plus persisted Lounge feed with optional category filter",
    mimeType: "application/json",
    tags: ["executive-lounge", "research", "news", "wire"],
  },
  "intel-meteora": {
    name: "Concierge Intel — Meteora DLMM",
    description: "Meteora DLMM pool deep-dive — TVL, APY, bin step, volume, and IL risk flags (Solana moat)",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "solana", "meteora"],
  },
  "intel-desk-brief": {
    name: "Concierge Intel — Desk brief",
    description: "Composite morning brief — macro snapshot + Meteora yields + desk verdict + insider overlay",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "research", "bundle"],
  },
  "intel-a2a-pipeline": {
    name: "Concierge Intel — A2A pipeline",
    description:
      "Agent-to-agent orchestration — desk brief + machine-readable A2A handoff + delegate routing to peer agents",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "research", "a2a", "bundle"],
  },
  "security-readiness": {
    name: "Concierge Security — API readiness",
    description:
      "Passive agent-readiness audit for an authorized external API — OpenAPI, discovery files, security headers (platform hosts blocked)",
    mimeType: "application/json",
    tags: ["executive-lounge", "security", "utility", "research"],
  },
  "security-headers": {
    name: "Concierge Security — HTTP headers",
    description:
      "Passive HTTP security header review for an authorized external target (no exploitation; platform hosts blocked)",
    mimeType: "application/json",
    tags: ["executive-lounge", "security", "utility"],
  },
  "security-scan": {
    name: "Concierge Security — Website scan",
    description:
      "Unified passive security breakdown — agent-readiness + HTTP headers + recommendations for an authorized external website (platform hosts blocked)",
    mimeType: "application/json",
    tags: ["executive-lounge", "security", "utility", "research"],
  },
  "security-deep-scan": {
    name: "Concierge Security — Deep scan",
    description:
      "Authorized async deep scan job — template probes via Concierge Security worker (queued). Poll with jobId. No exploitation.",
    mimeType: "application/json",
    tags: ["executive-lounge", "security", "utility", "research"],
  },
  "concierge-lp": {
    name: "Concierge LP — Session start",
    description:
      "Start a wallet-signed Concierge LP session — autonomous Meteora DLMM screen/manage loop with Concierge intel. Poll status; stop with signed message.",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "defi", "dlmm", "meteora", "utility"],
  },
  "resource-chat": {
    name: "Concierge Resources — Chat",
    description: "Agent-friendly Concierge chat turn — lite context, structured JSON reply",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "resources", "utility"],
  },
  "resource-image": {
    name: "Concierge Resources — Image",
    description: "Generate one image from a text prompt (base64 data URLs)",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "resources", "utility"],
  },
  "resource-scaffold": {
    name: "Concierge Resources — Scaffold",
    description: "Generate a single-file HTML page from a text brief",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "resources", "utility"],
  },
};

export type X402AcceptRequirement = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

type PaymentPayloadResource = {
  url: string;
  description?: string;
  mimeType?: string;
};

type PaymentPayloadV2 = {
  x402Version?: number;
  scheme?: string;
  network?: string;
  /** x402 v2 spec §5.2: object form; older buyers may send a bare URL string. */
  resource?: string | PaymentPayloadResource;
  accepted?: X402AcceptRequirement;
  payload?: unknown;
  extensions?: Record<string, unknown>;
};

function b64EncodeJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64DecodeJson<T>(header: string): T | null {
  try {
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(header, "base64").toString("utf-8");
    } else {
      const binary = atob(header);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    }
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function getPaymentSignatureHeader(request: Request): string | null {
  return request.headers.get("payment-signature") ?? request.headers.get("PAYMENT-SIGNATURE");
}

function resourcePath(kind: X402ResourceKind): string {
  switch (kind) {
    case "news":
      return "/api/news-open";
    case "concierge":
      return "/api/concierge";
    case "signal-publish":
      return "/api/lounge-signal-publish";
    case "signal-open":
      return "/api/lounge-signal-open";
    case "intel-tvl":
      return "/api/concierge-intel-tvl";
    case "intel-yields":
      return "/api/concierge-intel-yields";
    case "intel-whales":
      return "/api/concierge-intel-whales";
    case "intel-wallet":
      return "/api/concierge-intel-wallet";
    case "intel-verdict":
      return "/api/concierge-intel-verdict";
    case "intel-airdrop":
      return "/api/concierge-intel-airdrop";
    case "intel-listing":
      return "/api/concierge-intel-listing";
    case "intel-momentum":
      return "/api/concierge-intel-momentum";
    case "intel-scalp":
      return "/api/concierge-intel-scalp";
    case "intel-macro":
      return "/api/concierge-intel-macro";
    case "intel-wire":
      return "/api/concierge-intel-wire";
    case "intel-meteora":
      return "/api/concierge-intel-meteora";
    case "intel-desk-brief":
      return "/api/concierge-intel-desk-brief";
    case "intel-a2a-pipeline":
      return "/api/concierge-intel-a2a-pipeline";
    case "security-readiness":
      return "/api/concierge-security-readiness";
    case "security-headers":
      return "/api/concierge-security-headers";
    case "security-scan":
      return "/api/concierge-security-scan";
    case "security-deep-scan":
      return "/api/concierge-security-deep-scan";
    case "concierge-lp":
      return "/api/concierge-lp/start";
    case "resource-chat":
      return "/api/resource-chat";
    case "resource-image":
      return "/api/resource-image";
    case "resource-scaffold":
      return "/api/resource-scaffold";
    default:
      return `/api/${kind}`;
  }
}

function resourceUrl(request: Request, kind: X402ResourceKind): string {
  const host = request.headers.get("host") || "localhost";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}${resourcePath(kind)}`;
}

function normalizePayTo(addr: string): string {
  return addr.startsWith("0x") ? addr.toLowerCase() : addr;
}

function normalizeAsset(asset: string): string {
  return asset.startsWith("0x") ? asset.toLowerCase() : asset;
}

/** Match CAIP-2 Solana IDs whether facilitator sends 32-char or full genesis reference */
function normalizeSolanaNetwork(network: string): string {
  if (!network.startsWith("solana:")) return network;
  const ref = network.slice(7);
  if (ref.length > 32) return `solana:${ref.slice(0, 32)}`;
  return network;
}

async function buildAcceptsAsync(
  request: Request,
  kind: X402ResourceKind,
): Promise<X402AcceptRequirement[]> {
  const nets = getX402NetworkProfile();
  const { evm, sol } = getMerchantAddresses();
  const amount = atomicAmountForResource(kind);
  const accepts: X402AcceptRequirement[] = [];

  if (evm) {
    for (const network of getX402EvmAcceptNetworks()) {
      accepts.push({
        scheme: "exact",
        network,
        amount,
        asset: getUsdcAssetForNetwork(network),
        payTo: evm,
        maxTimeoutSeconds: 120,
        extra: getUsdcEip712ExtraForNetwork(network),
      });
    }
  }
  if (sol) {
    const solBase = {
      scheme: "exact" as const,
      network: nets.sol,
      amount,
      asset: getUsdcAssetForNetwork(nets.sol),
      payTo: sol,
      maxTimeoutSeconds: 120,
    };
    accepts.push({
      ...solBase,
      extra: { feePayer: PAYAI_FACILITATOR.solanaFeePayer },
    });
    accepts.push({
      ...solBase,
      extra: { feePayer: DEXTER_FACILITATOR.solanaFeePayer },
    });

    const tokenAccepts = await buildTokenPayAcceptsForResourceAsync({
      resourceKind: kind,
      usdcAmount: priceUsdcForResource(kind),
      network: nets.sol,
      fallbackSolPayTo: sol,
    });
    accepts.push(...tokenAccepts);
  }

  if (!accepts.length) {
    throw new Error(
      "x402 merchant addresses not configured or invalid — set X402_EVM_PAY_TO to your EVM wallet (0x + 40 hex)",
    );
  }

  return accepts;
}

function findMatchingRequirement(
  accepts: X402AcceptRequirement[],
  payload: PaymentPayloadV2,
): X402AcceptRequirement | null {
  const accepted = payload.accepted;
  if (!accepted) return null;

  const exact = accepts.find((req) => {
    if (req.scheme !== accepted.scheme) return false;
    if (normalizeSolanaNetwork(req.network) !== normalizeSolanaNetwork(accepted.network)) {
      return false;
    }
    if (req.amount !== accepted.amount) return false;
    if (normalizeAsset(req.asset) !== normalizeAsset(accepted.asset)) return false;
    if (normalizePayTo(req.payTo) !== normalizePayTo(accepted.payTo)) return false;
    return true;
  });
  if (exact) return exact;

  if (isTokenPaySelfSettleRequirement(accepted)) {
    const tokenAccepts = accepts.filter(isTokenPaySelfSettleRequirement);
    return resolveTokenPayMatchedAccept(
      tokenAccepts,
      accepted as import("./token-pay/types").TokenPaySelfSettleRequirement,
    );
  }

  return null;
}

/** Facilitator authentication. Dexter needs no auth. */
async function facilitatorAuthHeaders(
  endpoint: "verify" | "settle",
  facilitator: X402FacilitatorProfile,
): Promise<Record<string, string>> {
  if (facilitator.id === "cdp") {
    const apiKeyId = process.env.CDP_API_KEY_ID?.trim();
    const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim();
    if (!apiKeyId || !apiKeySecret) {
      throw new Error("CDP facilitator requires CDP_API_KEY_ID and CDP_API_KEY_SECRET");
    }

    const base = new URL(facilitator.url);
    const requestPath = `${base.pathname.replace(/\/$/, "")}/${endpoint}`;
    const { generateCdpJwt } = await import("./cdp-jwt");
    const jwt = await generateCdpJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: "POST",
      requestHost: base.host,
      requestPath,
    });
    return {
      Authorization: `Bearer ${jwt}`,
      "Correlation-Context": "sdkLanguage=typescript,source=concierge-agent",
    };
  }

  if (facilitator.id !== "payai") return {};

  const keyId = process.env.PAYAI_API_KEY_ID?.trim();
  const keySecret = process.env.PAYAI_API_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return {};

  try {
    const mod = await import("@payai/facilitator");
    const headers = await mod.createPayAIAuthHeaders(keyId, keySecret)();
    return headers[endpoint] ?? {};
  } catch (e) {
    console.error("[x402] PayAI JWT auth failed", e instanceof Error ? e.message : e);
    return {};
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function facilitatorPost<T>(
  path: string,
  body: unknown,
  endpoint: "verify" | "settle",
  facilitator: X402FacilitatorProfile,
): Promise<T> {
  let res: Response;
  if (facilitator.id === "cdp" && process.env.VERCEL) {
    // Coinbase's WAF serves HTML 403 to Vercel Edge egress; hop through the
    // Node serverless proxy (AWS egress) which also signs the CDP JWT.
    const secret = process.env.CDP_API_KEY_SECRET?.trim();
    if (!secret) throw new Error("CDP facilitator requires CDP_API_KEY_ID and CDP_API_KEY_SECRET");
    res = await fetch(`${loungeApiOrigin()}/api/x402-cdp-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-internal-cdp": await sha256Hex(secret),
      },
      body: JSON.stringify({ endpoint, body }),
      signal: AbortSignal.timeout(28_000),
    });
  } else {
    const auth = await facilitatorAuthHeaders(endpoint, facilitator);
    res = await fetch(`${facilitator.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...auth,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  }
  const text = await res.text();
  // CDP reports Bazaar discovery accept/reject status here; surface it for indexing diagnosis.
  const extResponses = res.headers.get("extension-responses") ?? res.headers.get("EXTENSION-RESPONSES");
  if (extResponses) {
    console.log(`[x402] ${facilitator.id} ${path} EXTENSION-RESPONSES: ${extResponses}`);
  }
  if (!res.ok) {
    let detail = text.slice(0, 240).replace(/\s+/g, " ").trim();
    try {
      const err = JSON.parse(text) as { error?: unknown; message?: unknown; errorMessage?: unknown };
      const candidate = err.error ?? err.message ?? err.errorMessage;
      if (typeof candidate === "string" && candidate) detail = candidate;
      else if (candidate != null) detail = JSON.stringify(candidate).slice(0, 240);
    } catch {
      /* non-JSON error body (HTML/WAF) — keep truncated text */
    }
    throw new Error(`Facilitator ${path} HTTP ${res.status}: ${detail || "empty body"}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Facilitator ${path} returned invalid JSON (${res.status})`);
  }
}

function resolveFacilitatorForRequirement(req: X402AcceptRequirement): X402FacilitatorProfile {
  if (isRobinhoodNetwork(req.network)) {
    return getRobinhoodFacilitatorProfile();
  }
  const feePayer = req.extra?.feePayer;
  if (typeof feePayer === "string" && req.network.startsWith("solana:")) {
    return resolveFacilitatorForSolanaFeePayer(feePayer);
  }
  return getX402FacilitatorProfile();
}

function isFacilitatorAuthError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /Facilitator \/(?:verify|settle) HTTP 40[13]\b/i.test(e.message);
}

function isFacilitatorOutageError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // Auth failures must not look like outages — otherwise CDP 403 silently falls back to
  // PayAI, the call "succeeds", and Bazaar never indexes the settle.
  if (isFacilitatorAuthError(e)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("invalid json") ||
    msg.includes("http 5") ||
    msg.includes("http 429") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("aborted")
  );
}

async function verifyAndSettle(
  paymentPayload: PaymentPayloadV2,
  matched: X402AcceptRequirement,
  resourceKind: X402ResourceKind,
  resource?: string,
): Promise<{
  payer: string;
  transaction: string;
  network?: string;
}> {
  if (isTokenPaySelfSettleRequirement(matched)) {
    return verifyAndSettleTokenPaySelf(
      paymentPayload as TokenPayPaymentPayload,
      matched,
      resourceKind,
    );
  }

  const primary = resolveFacilitatorForRequirement(matched);
  const facilitators: X402FacilitatorProfile[] = [primary];
  // Robinhood USDG must settle only on the RH facilitator (PayAI/Dexter/CDP do not support 4663).
  let outageFallback: X402FacilitatorProfile | null = null;
  if (!isRobinhoodNetwork(matched.network) && !matched.network.startsWith("solana:")) {
    const fallback = getX402FacilitatorFallback();
    if (fallback.id !== primary.id) {
      facilitators.push(fallback);
      outageFallback = fallback;
    }
  }

  let lastError: unknown;
  // CDP Bazaar indexes a resource only when the settle payload carries both the v2
  // `resource` object (spec §5.2) and the `extensions.bazaar` block from the 402
  // challenge (x402-foundation/x402#2207). Buyer SDKs rarely echo either, so inject
  // them server-side before settlement.
  const buyerResource = paymentPayload.resource;
  const resourceObject: PaymentPayloadResource | undefined =
    typeof buyerResource === "object" && buyerResource?.url
      ? buyerResource
      : typeof buyerResource === "string" && buyerResource
        ? { url: buyerResource }
        : resource
          ? {
              url: resource,
              description: RESOURCE_META[resourceKind]?.description,
              mimeType: RESOURCE_META[resourceKind]?.mimeType,
            }
          : undefined;
  const hasExtensions =
    paymentPayload.extensions && Object.keys(paymentPayload.extensions).length > 0;
  const facilitatorPayload: PaymentPayloadV2 = {
    ...paymentPayload,
    // CDP /verify and /settle require x402Version on both the envelope and the
    // nested paymentPayload (v2 schema). Buyer headers sometimes omit it.
    x402Version: paymentPayload.x402Version ?? 2,
    ...(resourceObject ? { resource: resourceObject } : {}),
    extensions: hasExtensions ? paymentPayload.extensions : buildBazaarExtension(resourceKind),
  };
  const facilitatorBody = {
    x402Version: facilitatorPayload.x402Version ?? 2,
    paymentPayload: facilitatorPayload,
    paymentRequirements: matched,
  };
  for (const facilitator of facilitators) {
    try {
      const verify = await facilitatorPost<{ isValid: boolean; invalidReason?: string; payer?: string }>(
        "/verify",
        facilitatorBody,
        "verify",
        facilitator,
      );

      if (!verify.isValid) {
        throw new Error(verify.invalidReason || "Payment verification failed");
      }

      const settle = await facilitatorPost<{
        success: boolean;
        errorReason?: string;
        payer?: string;
        transaction?: string;
        network?: string;
      }>("/settle", facilitatorBody, "settle", facilitator);

      if (!settle.success) {
        throw new Error(settle.errorReason || "Payment settlement failed");
      }

      return {
        payer: settle.payer || verify.payer || "unknown",
        transaction: settle.transaction || "",
        network: settle.network,
      };
    } catch (e) {
      lastError = e;
      if (
        facilitators.length > 1 &&
        outageFallback &&
        facilitator.id === primary.id &&
        isFacilitatorOutageError(e)
      ) {
        console.warn(
          `[x402] ${primary.name} unavailable, trying ${outageFallback.name}`,
          e instanceof Error ? e.message : e,
        );
        continue;
      }
      throw e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Payment settlement failed");
}

export async function buildPaymentRequiredResponse(
  request: Request,
  kind: X402ResourceKind,
  cors: Record<string, string>,
  error = "PAYMENT-SIGNATURE header is required",
): Promise<Response> {
  const accepts = await buildAcceptsAsync(request, kind);
  const meta = RESOURCE_META[kind];
  const listing = x402ServiceListingMeta(
    `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host") || "conc-exe.xyz"}`,
  );
  const paymentRequired = {
    x402Version: 2,
    error,
    resource: {
      url: resourceUrl(request, kind),
      name: meta.name,
      serviceName: listing.serviceName,
      description: meta.description,
      mimeType: meta.mimeType,
      tags: listing.tags,
      iconUrl: listing.iconUrl,
    },
    accepts,
    extensions: buildBazaarExtension(kind),
  };

  const usdcPrice = priceUsdcForResource(kind);
  const tokenLabels = await formatTokenPayPriceLabelsForResourceAsync(kind, usdcPrice);
  const tokenLabel = tokenLabels.length ? ` or ${tokenLabels.join(" or ")}` : "";

  const clientMessage =
    error === "PAYMENT-SIGNATURE header is required" ? "Payment required" : error;

  return new Response(
    JSON.stringify({
      error: clientMessage,
      code: "payment_required",
      detail: error,
      priceUsdc: usdcPrice,
      priceLabel: `${priceLabelForResource(kind)}${tokenLabel}`,
      resource: kind,
    }),
    {
      status: 402,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "PAYMENT-REQUIRED": b64EncodeJson(paymentRequired),
      },
    },
  );
}

export type X402GateResult =
  | {
      ok: true;
      payer: string;
      transaction: string;
      paymentResponseHeader: string | null;
    }
  | { ok: false; response: Response };

export async function requireX402Payment(
  request: Request,
  kind: X402ResourceKind,
  cors: Record<string, string>,
): Promise<X402GateResult> {
  if (!isX402Enabled()) {
    return {
      ok: true,
      payer: "dev-bypass",
      transaction: "",
      paymentResponseHeader: null,
    };
  }

  try {
    const sigHeader = getPaymentSignatureHeader(request);
    if (!sigHeader) {
      const freeTier = await trySoonHolderFreeTier(request, kind);
      if (freeTier.ok) {
        return {
          ok: true,
          payer: freeTier.wallet,
          transaction: "soon-holder-free-tier",
          paymentResponseHeader: null,
        };
      }
      const securityFree = await trySoonSecurityFreeTier(request, kind);
      if (securityFree.ok) {
        return {
          ok: true,
          payer: securityFree.wallet,
          transaction: "soon-holder-free-tier",
          paymentResponseHeader: null,
        };
      }

      const tcxCredits = await tryTcxCreditsSettlement(request, kind);
      if (tcxCredits.ok) {
        return {
          ok: true,
          payer: tcxCredits.wallet,
          transaction: `tcx-credits:${tcxCredits.creditsSpent}`,
          paymentResponseHeader: null,
        };
      }

      const oobe = await verifyOobeSapSettlement(request, kind);
      if (oobe?.ok) {
        const paymentResponseHeader = b64EncodeJson({
          success: true,
          transaction: oobe.transaction,
          network: getX402NetworkProfile().sol,
          payer: oobe.payer,
          scheme: "oobe-sap-settlement",
        });
        return {
          ok: true,
          payer: oobe.payer,
          transaction: oobe.transaction,
          paymentResponseHeader,
        };
      }
      if (oobe && !oobe.ok) {
        return {
          ok: false,
          response: await buildPaymentRequiredResponse(request, kind, cors, oobe.reason),
        };
      }

      return { ok: false, response: await buildPaymentRequiredResponse(request, kind, cors) };
    }

    const paymentPayload = b64DecodeJson<PaymentPayloadV2>(sigHeader);
    if (!paymentPayload) {
      return {
        ok: false,
        response: await buildPaymentRequiredResponse(
          request,
          kind,
          cors,
          "Invalid PAYMENT-SIGNATURE header",
        ),
      };
    }

    const accepts = await buildAcceptsAsync(request, kind);
    const matched = findMatchingRequirement(accepts, paymentPayload);
    if (!matched) {
      return {
        ok: false,
        response: await buildPaymentRequiredResponse(
          request,
          kind,
          cors,
          "Payment does not match accepted requirements",
        ),
      };
    }

    const settle = await verifyAndSettle(
      paymentPayload,
      matched,
      kind,
      resourceUrl(request, kind),
    );

    const paymentResponseHeader = b64EncodeJson({
      success: true,
      transaction: settle.transaction,
      network: settle.network,
      payer: settle.payer,
    });

    return {
      ok: true,
      payer: settle.payer,
      transaction: settle.transaction,
      paymentResponseHeader,
    };
  } catch (e) {
    if (
      e instanceof Error &&
      (/Payment verification failed|Payment settlement failed|(?:TCX|SOON|token) payment:/i.test(
        e.message,
      ))
    ) {
      return {
        ok: false,
        response: await buildPaymentRequiredResponse(request, kind, cors, e.message),
      };
    }
    if (
      e instanceof Error &&
      (/CDP facilitator requires|CDP_API_KEY_SECRET is not a valid|Invalid key format|Failed to generate .* JWT|Facilitator \/(?:verify|settle) HTTP 40[13]/i.test(
        e.message,
      ))
    ) {
      console.error("[x402]", e.message);
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: "CDP facilitator authentication failed.",
            detail:
              "Check CDP_API_KEY_ID and CDP_API_KEY_SECRET in Vercel (Secret API Key, no quotes, redeploy after update).",
          }),
          {
            status: 503,
            headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
          },
        ),
      };
    }
    console.error("[x402]", e instanceof Error ? e.message : e);
    const rawDetail = e instanceof Error ? e.message : String(e);
    const safeDetail = rawDetail
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
      .slice(0, 200);
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Payment service temporarily unavailable. Try again shortly.",
          detail: safeDetail,
        }),
        {
          status: 503,
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
        },
      ),
    };
  }
}

export type PaidX402RouteContinue = {
  cors: Record<string, string>;
  gate: Extract<X402GateResult, { ok: true }>;
};

/**
 * x402scan probes with GET (and POST) without Origin — return 402 before 405 / CORS rejection.
 * Real clients still use POST + payment + allowed Origin.
 */
export async function guardPaidX402Api(
  request: Request,
  kind: X402ResourceKind,
): Promise<{ response: Response } | { continue: PaidX402RouteContinue }> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return { response: new Response(null, { status: 204, headers: cors }) };
  }

  if (request.method !== "POST" && request.method !== "GET" && request.method !== "HEAD") {
    return {
      response: new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      }),
    };
  }

  const gate = await requireX402Payment(request, kind, cors);
  if (!gate.ok) {
    return { response: gate.response };
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return {
      response: await buildPaymentRequiredResponse(
        request,
        kind,
        cors,
        "Use POST with a JSON body after payment",
      ),
    };
  }

  return { continue: { cors, gate } };
}
