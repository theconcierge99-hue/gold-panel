/**
 * x402 payment gate via PayAI facilitator HTTP API (Edge-safe).
 * Avoids @x402/evm/svm server SDKs and @payai/facilitator bundle on Vercel.
 */
import {
  getMerchantAddresses,
  getX402NetworkProfile,
  getUsdcAssetForNetwork,
  isX402Enabled,
  SOLANA_FEE_PAYER,
  X402_PRICE_LABEL,
} from "./x402-config";
import { corsHeadersFor } from "./concierge-security";
import { buildBazaarExtension } from "./x402-discovery";
import { atomicAmountForResource, priceUsdcForResource, type X402ResourceKind } from "./x402-pricing";
import { x402ServiceListingMeta } from "./x402-service-meta";

export type { X402ResourceKind };

const FACILITATOR_URL = "https://facilitator.payai.network";

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
    description: "Publish one RWA intelligence signal to the Lounge (anti-spam fee; Solana NFT mint in Phantom)",
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
    description: "Tokens with large move potential (up or down) — insider, positioning, narrative synthesis",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "alpha"],
  },
  "intel-scalp": {
    name: "Concierge Intel — Scalp",
    description: "BTC/ETH/BNB/SOL USDT scalping desk — 5m & 15m klines, RSI/EMA, perp funding & positioning",
    mimeType: "application/json",
    tags: ["executive-lounge", "ai", "concierge", "defi", "trading"],
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

type PaymentPayloadV2 = {
  x402Version?: number;
  scheme?: string;
  network?: string;
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

/** Match CAIP-2 Solana IDs whether facilitator sends 32-char or full genesis reference */
function normalizeSolanaNetwork(network: string): string {
  if (!network.startsWith("solana:")) return network;
  const ref = network.slice(7);
  if (ref.length > 32) return `solana:${ref.slice(0, 32)}`;
  return network;
}

function buildAccepts(request: Request, kind: X402ResourceKind): X402AcceptRequirement[] {
  const nets = getX402NetworkProfile();
  const { evm, sol } = getMerchantAddresses();
  const amount = atomicAmountForResource(kind);
  const accepts: X402AcceptRequirement[] = [];

  if (evm) {
    accepts.push({
      scheme: "exact",
      network: nets.evm,
      amount,
      asset: getUsdcAssetForNetwork(nets.evm),
      payTo: evm,
      maxTimeoutSeconds: 120,
      extra: { name: "USDC", version: "2" },
    });
  }
  if (sol) {
    accepts.push({
      scheme: "exact",
      network: nets.sol,
      amount,
      asset: getUsdcAssetForNetwork(nets.sol),
      payTo: sol,
      maxTimeoutSeconds: 120,
      extra: { feePayer: SOLANA_FEE_PAYER },
    });
  }

  if (!accepts.length) {
    throw new Error(
      "x402 merchant addresses not configured or invalid — set X402_EVM_PAY_TO to your Base wallet (0x + 40 hex)",
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
  return (
    accepts.find((req) => {
      if (req.scheme !== accepted.scheme) return false;
      if (normalizeSolanaNetwork(req.network) !== normalizeSolanaNetwork(accepted.network)) {
        return false;
      }
      if (req.amount !== accepted.amount) return false;
      if (req.asset !== accepted.asset) return false;
      if (normalizePayTo(req.payTo) !== normalizePayTo(accepted.payTo)) return false;
      return true;
    }) ?? null
  );
}

/** Free tier: no auth. Optional PAYAI_API_KEY_* uses Ed25519 JWT (Web Crypto). */
async function facilitatorAuthHeaders(
  endpoint: "verify" | "settle",
): Promise<Record<string, string>> {
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

async function facilitatorPost<T>(
  path: string,
  body: unknown,
  endpoint: "verify" | "settle",
): Promise<T> {
  const auth = await facilitatorAuthHeaders(endpoint);
  const res = await fetch(`${FACILITATOR_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...auth,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(`Facilitator ${path} returned invalid JSON (${res.status})`);
  }
  if (!res.ok) {
    const err = data as { error?: string; message?: string };
    throw new Error(err.error || err.message || `Facilitator ${path} HTTP ${res.status}`);
  }
  return data;
}

export async function buildPaymentRequiredResponse(
  request: Request,
  kind: X402ResourceKind,
  cors: Record<string, string>,
  error = "PAYMENT-SIGNATURE header is required",
): Promise<Response> {
  const accepts = buildAccepts(request, kind);
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

  const clientMessage =
    error === "PAYMENT-SIGNATURE header is required" ? "Payment required" : error;

  return new Response(
    JSON.stringify({
      error: clientMessage,
      detail: error,
      priceUsdc: priceUsdcForResource(kind),
      priceLabel:
        kind === "signal-publish"
          ? "$1.00"
          : X402_PRICE_LABEL,
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

    const accepts = buildAccepts(request, kind);
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

    const verify = await facilitatorPost<{ isValid: boolean; invalidReason?: string; payer?: string }>(
      "/verify",
      { paymentPayload, paymentRequirements: matched },
      "verify",
    );

    if (!verify.isValid) {
      return {
        ok: false,
        response: await buildPaymentRequiredResponse(
          request,
          kind,
          cors,
          verify.invalidReason || "Payment verification failed",
        ),
      };
    }

    const settle = await facilitatorPost<{
      success: boolean;
      errorReason?: string;
      payer?: string;
      transaction?: string;
      network?: string;
    }>("/settle", { paymentPayload, paymentRequirements: matched }, "settle");

    if (!settle.success) {
      return {
        ok: false,
        response: await buildPaymentRequiredResponse(
          request,
          kind,
          cors,
          settle.errorReason || "Payment settlement failed",
        ),
      };
    }

    const paymentResponseHeader = b64EncodeJson({
      success: true,
      transaction: settle.transaction,
      network: settle.network,
      payer: settle.payer,
    });

    return {
      ok: true,
      payer: settle.payer || "unknown",
      transaction: settle.transaction || "",
      paymentResponseHeader,
    };
  } catch (e) {
    console.error("[x402]", e instanceof Error ? e.message : e);
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Payment service temporarily unavailable. Try again shortly.",
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
