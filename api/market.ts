import { assertAllowedOrigin, corsHeadersFor, sanitizePublicError } from "./lib/concierge-security";
import { buildLoungeMarketPayload } from "./lib/lounge-market";

/** Edge — free headline feed; no x402 / Node SDK deps */
export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    assertAllowedOrigin(request);

    const payload = await buildLoungeMarketPayload();
    const headers: Record<string, string> = {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
    };

    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (e) {
    const msg = sanitizePublicError(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
