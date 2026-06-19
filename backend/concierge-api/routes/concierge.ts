import { normalizeGeminiApiKey, runConciergeGemini } from "../concierge-gemini";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "../concierge-security";
import { getAgentById } from "../agent-identity-store";
import { reportPaidRouteToZauth } from "../zauth-paid-response";
import { guardPaidX402Api } from "../x402-server";

function parseAgentIdHeader(request: Request): string | null {
  const id = request.headers.get("x-agent-id")?.trim();
  if (!id || !/^agt_[a-f0-9]{8,32}$/i.test(id)) return null;
  return id;
}

/** Node runtime (api/concierge.ts) — Gemini + intel can exceed Edge ~30s. */
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

  const startedAt = Date.now();

  try {
    assertAllowedOrigin(request);

    const raw = await readBodyWithLimit(request);
    const { mode, message, history, signal, market, agentModel } = validateConciergeRequest(raw);

    const result = await runConciergeGemini({
      apiKey: normalizeGeminiApiKey(process.env.GEMINI_API_KEY),
      mode,
      message,
      history,
      signal,
      market,
      agentModel,
    });

    const agentId = parseAgentIdHeader(request);
    const agentRec = agentId ? await getAgentById(agentId) : null;
    const payload =
      agentRec != null
        ? {
            ...result,
            agent: {
              id: agentRec.id,
              name: agentRec.name,
              solAddress: agentRec.solAddress,
              evmAddress: agentRec.evmAddress,
            },
          }
        : result;

    const extraHeaders: Record<string, string> = {};
    if (payGate.ok && payGate.paymentResponseHeader) {
      extraHeaders["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
    }
    reportPaidRouteToZauth(request, "concierge", 200, payload, startedAt, {
      payer: payGate.payer,
      transaction: payGate.transaction,
      paymentResponseHeader: payGate.paymentResponseHeader,
    });
    return jsonResponse(request, payload, 200, extraHeaders);
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
