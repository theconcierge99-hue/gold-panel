/**
 * x402 payment gate via facilitator HTTP API (Edge-safe).
 * Primary: PayAI. Fallback: Dexter (dual Solana accepts + EVM retry on outage).
 */
import {
  getMerchantAddresses,
  getX402NetworkProfile,
  getUsdcAssetForNetwork,
  isX402Enabled,
  X402_PRICE_LABEL,
} from "./x402-config";
import {
  getX402FacilitatorProfile,
  getX402FacilitatorFallback,
  resolveFacilitatorForSolanaFeePayer,
  PAYAI_FACILITATOR,
  DEXTER_FACILITATOR,
  type X402FacilitatorProfile,
} from "./x402-facilitator";
import { corsHeadersFor } from "./concierge-security";
import { buildBazaarExtension } from "./x402-discovery";
import { priceUsdcForResource, atomicAmountForResource, type X402ResourceKind } from "./x402-pricing";
import { x402ServiceListingMeta } from "./x402-service-meta";
import { getSoonDecimals, getSoonMint } from "./soon-token";
import {
  SOON_X402_RESOURCE_KINDS,
  formatSoonUiFromAtomic,
  isSoonX402Enabled,
  soonAtomicForUsdcAsync,
} from "./soon-x402";
import { isSelfSettleRequirement, verifyAndSettleSoonSelf } from "./x402-soon-settle";

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

async function buildAcceptsAsync(
  request: Request,
  kind: X402ResourceKind,
): Promise<X402AcceptRequirement[]> {
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

    if (SOON_X402_RESOURCE_KINDS.has(kind) && isSoonX402Enabled()) {
      const soonMint = getSoonMint()!;
      const soonAmount = await soonAtomicForUsdcAsync(priceUsdcForResource(kind));
      if (soonAmount) {
        accepts.push({
          scheme: "exact",
          network: nets.sol,
          amount: soonAmount,
          asset: soonMint,
          payTo: sol,
          maxTimeoutSeconds: 120,
          extra: {
            settlement: "self",
            name: "SOON",
            decimals: getSoonDecimals(),
          },
        });
      }
    }
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

/** PayAI only — optional PAYAI_API_KEY_* uses Ed25519 JWT (Web Crypto). Dexter needs no auth. */
async function facilitatorAuthHeaders(
  endpoint: "verify" | "settle",
  facilitator: X402FacilitatorProfile,
): Promise<Record<string, string>> {
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

async function facilitatorPost<T>(
  path: string,
  body: unknown,
  endpoint: "verify" | "settle",
  facilitator: X402FacilitatorProfile,
): Promise<T> {
  const auth = await facilitatorAuthHeaders(endpoint, facilitator);
  const res = await fetch(`${facilitator.url}${path}`, {
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

function resolveFacilitatorForRequirement(req: X402AcceptRequirement): X402FacilitatorProfile {
  const feePayer = req.extra?.feePayer;
  if (typeof feePayer === "string" && req.network.startsWith("solana:")) {
    return resolveFacilitatorForSolanaFeePayer(feePayer);
  }
  return getX402FacilitatorProfile();
}

function isFacilitatorOutageError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
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
): Promise<{
  payer: string;
  transaction: string;
  network?: string;
}> {
  if (isSelfSettleRequirement(matched)) {
    return verifyAndSettleSoonSelf(paymentPayload, matched);
  }

  const primary = resolveFacilitatorForRequirement(matched);
  const facilitators: X402FacilitatorProfile[] = [primary];
  const fallback = getX402FacilitatorFallback();
  if (fallback.id !== primary.id && !matched.network.startsWith("solana:")) {
    facilitators.push(fallback);
  }

  let lastError: unknown;
  for (const facilitator of facilitators) {
    try {
      const verify = await facilitatorPost<{ isValid: boolean; invalidReason?: string; payer?: string }>(
        "/verify",
        { paymentPayload, paymentRequirements: matched },
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
      }>("/settle", { paymentPayload, paymentRequirements: matched }, "settle", facilitator);

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
      if (facilitators.length > 1 && facilitator.id === primary.id && isFacilitatorOutageError(e)) {
        console.warn(`[x402] ${primary.name} unavailable, trying ${fallback.name}`, e instanceof Error ? e.message : e);
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
  const soonAtomic =
    SOON_X402_RESOURCE_KINDS.has(kind) && isSoonX402Enabled()
      ? await soonAtomicForUsdcAsync(usdcPrice)
      : null;
  const soonLabel =
    soonAtomic != null
      ? ` or ${formatSoonUiFromAtomic(soonAtomic)} SOON`
      : "";

  const clientMessage =
    error === "PAYMENT-SIGNATURE header is required" ? "Payment required" : error;

  return new Response(
    JSON.stringify({
      error: clientMessage,
      detail: error,
      priceUsdc: usdcPrice,
      priceLabel:
        kind === "signal-publish"
          ? "$1.00"
          : `${X402_PRICE_LABEL}${soonLabel}`,
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

    const settle = await verifyAndSettle(paymentPayload, matched);

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
      (/Payment verification failed|Payment settlement failed|SOON payment/i.test(e.message))
    ) {
      return {
        ok: false,
        response: await buildPaymentRequiredResponse(request, kind, cors, e.message),
      };
    }
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
