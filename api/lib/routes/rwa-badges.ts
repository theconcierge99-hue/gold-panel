import { assertAllowedOrigin, corsHeadersFor, sanitizePublicError } from "../concierge-security";
import { getReaderBadgeProfile } from "../rwa-badge";

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
    const wallet = url.searchParams.get("wallet")?.trim();
    if (!wallet) {
      return new Response(JSON.stringify({ error: "wallet required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const profile = await getReaderBadgeProfile(wallet);

    return new Response(JSON.stringify({ ok: true, profile }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
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
