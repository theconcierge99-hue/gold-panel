import { normalizeGeminiApiKey, runConciergeGemini } from "./lib/concierge-gemini";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "./lib/concierge-security";
import { guardPaidX402Api } from "./lib/x402-server";

/** Edge — Gemini + x402 only (no Solana / Metaplex imports) */
export const config = {
  runtime: "edge",
};

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

export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "concierge");
  if ("response" in routed) return routed.response;
  const { cors, gate: payGate } = routed.continue;

  try {
    assertAllowedOrigin(request);

    const raw = await readBodyWithLimit(request);
    const { mode, message, history, signal, market } = validateConciergeRequest(raw);

    const result = await runConciergeGemini({
      apiKey: normalizeGeminiApiKey(process.env.GEMINI_API_KEY),
      mode,
      message,
      history,
      signal,
      market,
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
