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
  X402_PRICE_ATOMIC,
  X402_PRICE_LABEL,
  X402_PRICE_USDC,
} from "./x402-config";

export type X402ResourceKind = "news" | "concierge";

const FACILITATOR_URL = "https://facilitator.payai.network";

const RESOURCE_META: Record<X402ResourceKind, { description: string; mimeType: string }> = {
  news: {
    description: "Open one news article (full story link)",
    mimeType: "application/json",
  },
  concierge: {
    description: "Concierge AI chat turn (single request)",
    mimeType: "application/json",
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

function resourceUrl(request: Request, kind: X402ResourceKind): string {
  const host = request.headers.get("host") || "localhost";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const path = kind === "news" ? "/api/news-open" : "/api/concierge";
  return `${proto}://${host}${path}`;
}

function normalizePayTo(addr: string): string {
  return addr.startsWith("0x") ? addr.toLowerCase() : addr;
}

function buildAccepts(request: Request, kind: X402ResourceKind): X402AcceptRequirement[] {
  const nets = getX402NetworkProfile();
  const { evm, sol } = getMerchantAddresses();
  const accepts: X402AcceptRequirement[] = [];

  if (evm) {
    accepts.push({
      scheme: "exact",
      network: nets.evm,
      amount: X402_PRICE_ATOMIC,
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
      amount: X402_PRICE_ATOMIC,
      asset: getUsdcAssetForNetwork(nets.sol),
      payTo: sol,
      maxTimeoutSeconds: 120,
      extra: { feePayer: SOLANA_FEE_PAYER },
    });
  }

  if (!accepts.length) {
    throw new Error("x402 merchant addresses not configured");
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
      if (req.network !== accepted.network) return false;
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
  const paymentRequired = {
    x402Version: 2,
    error,
    resource: {
      url: resourceUrl(request, kind),
      description: meta.description,
      mimeType: meta.mimeType,
    },
    accepts,
    extensions: {},
  };

  return new Response(
    JSON.stringify({
      error: "Payment required",
      priceUsdc: X402_PRICE_USDC,
      priceLabel: X402_PRICE_LABEL,
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
