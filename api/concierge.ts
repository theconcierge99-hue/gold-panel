import { normalizeGeminiApiKey, runConciergeGemini } from "./lib/concierge-gemini";
import { fetchLiveMarketSnapshot } from "./lib/market-data";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "./lib/concierge-security";
import { requireX402Payment } from "./lib/x402-server";

/** Node runtime for x402 verify/settle (PayAI) + Gemini */
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
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

export default {
  async fetch(request: Request): Promise<Response> {
    const cors = corsHeadersFor(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return jsonResponse(request, { error: "Method not allowed" }, 405);
    }

    try {
      assertAllowedOrigin(request);

      const payGate = await requireX402Payment(request, "concierge", cors);
      if (!payGate.ok) return payGate.response;

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
  },
};
