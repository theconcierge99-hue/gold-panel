import { assertAllowedOrigin, corsHeadersFor, sanitizePublicError } from "../concierge-security";
import { getSignalRwaToken } from "../rwa-store";
import { getSignalById } from "../signal-store";

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
    const url = new URL(request.url);
    const signalId = url.searchParams.get("signalId")?.trim();
    if (!signalId) {
      return new Response(JSON.stringify({ error: "signalId required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const token = await getSignalRwaToken(signalId);
    if (!token) {
      const signal = await getSignalById(signalId);
      if (!signal) {
        return new Response(JSON.stringify({ error: "Signal not found" }), {
          status: 404,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "RWA token not minted for this signal" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, token }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    const msg = sanitizePublicError(e);
    const status = msg.includes("not allowed") ? 403 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
