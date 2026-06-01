import { normalizeGeminiApiKey, runConciergeGemini } from "./lib/concierge-gemini";
import { fetchLiveMarketSnapshot } from "./lib/market-data";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "./lib/concierge-security";
import { guardPaidX402Api } from "./lib/x402-server";
import type { X402ResourceKind } from "./lib/x402-pricing";

/** Edge — Gemini + x402 via PayAI HTTP (no Node-only @x402 server SDK) */
export const config = {
  runtime: "edge",
};

type LoungeDelegate = X402ResourceKind | "rwa-mint-sol" | null;

/** Vercel rewrites /api/lounge-signal-* and /api/rwa-mint-sol → /api/concierge?__lounge_resource=… */
function loungeDelegatedResource(request: Request): LoungeDelegate {
  const q = new URL(request.url).searchParams.get("__lounge_resource");
  if (q === "signal-publish" || q === "signal-open") return q;
  if (q === "rwa-mint-sol") return q;
  return null;
}

function authorizeRwaMint(request: Request): boolean {
  const secret = process.env.RWA_MINT_INTERNAL_KEY?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}

function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function handleRwaMintSol(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, 405);
  }
  if (!authorizeRwaMint(request)) {
    return jsonResponse(request, { error: "Unauthorized" }, 401);
  }
  try {
    const body = (await request.json()) as { signalId?: string };
    const signalId = String(body.signalId ?? "").trim();
    if (!signalId) {
      return jsonResponse(request, { error: "signalId required" }, 400);
    }
    const { getSignalById } = await import("./lib/signal-store");
    const signal = await getSignalById(signalId);
    if (!signal) {
      return jsonResponse(request, { error: "Signal not found" }, 404);
    }
    const { mintSolanaSignalNftForSignal } = await import("./lib/rwa-solana-mint");
    const solanaNft = await mintSolanaSignalNftForSignal(signal);
    return jsonResponse(request, { ok: true, solanaNft }, 200);
  } catch (e) {
    console.error("[rwa-mint-sol]", e instanceof Error ? e.message : e);
    return jsonResponse(request, { error: sanitizePublicError(e) }, 500);
  }
}

export default async function handler(request: Request): Promise<Response> {
  const delegated = loungeDelegatedResource(request);
  if (delegated === "rwa-mint-sol") {
    return handleRwaMintSol(request);
  }
  if (delegated === "signal-publish") {
    const routed = await guardPaidX402Api(request, "signal-publish");
    if ("response" in routed) return routed.response;
    const { runSignalPublishAfterPayment } = await import("./lib/signal-publish-handler");
    return runSignalPublishAfterPayment(request, routed.continue);
  }
  if (delegated === "signal-open") {
    const routed = await guardPaidX402Api(request, "signal-open");
    if ("response" in routed) return routed.response;
    const { runSignalOpenAfterPayment } = await import("./lib/signal-open-handler");
    return runSignalOpenAfterPayment(request, routed.continue);
  }

  const routed = await guardPaidX402Api(request, "concierge");
  if ("response" in routed) return routed.response;
  const { cors, gate: payGate } = routed.continue;

  try {
    assertAllowedOrigin(request);

    const raw = await readBodyWithLimit(request);
    const { mode, message, history, signal, market } = validateConciergeRequest(raw);

    const liveSnapshot = await fetchLiveMarketSnapshot();

    const result = await runConciergeGemini({
      apiKey: normalizeGeminiApiKey(process.env.GEMINI_API_KEY),
      mode,
      message,
      history,
      signal,
      market,
      liveSnapshot,
    });

    const extraHeaders: Record<string, string> = {};
    if (payGate.ok && payGate.paymentResponseHeader) {
      extraHeaders["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
    }
    return jsonResponse(request, result, 200, extraHeaders);
  } catch (e) {
    const msg = sanitizePublicError(e);
    console.error("[api/concierge]", e instanceof Error ? e.message : e);
    const status =
      msg.includes("not allowed") || msg.includes("too large")
        ? 403
        : msg.includes("required") || msg.includes("Invalid")
          ? 400
          : msg.includes("not configured")
            ? 503
            : 500;
    return jsonResponse(request, { error: msg }, status);
  }
}
