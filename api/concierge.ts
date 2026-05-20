import { runConciergeGemini } from "./lib/concierge-gemini";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "./lib/concierge-security";

/** Edge runtime — fits Vercel Hobby (no Node serverless cold-start issues) */
export const config = {
  runtime: "edge",
};

function jsonResponse(request: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, 405);
  }

  try {
    assertAllowedOrigin(request);
    const raw = await readBodyWithLimit(request);
    const { mode, message, history, signal, market } = validateConciergeRequest(raw);

    const result = await runConciergeGemini({
      apiKey: process.env.GEMINI_API_KEY,
      mode,
      message,
      history,
      signal,
      market,
    });

    return jsonResponse(request, result, 200);
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
