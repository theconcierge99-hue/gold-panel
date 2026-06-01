import { corsHeadersFor, sanitizePublicError } from "./lib/concierge-security";
import { authorizeInternalApi } from "./lib/lounge-internal-auth";

/** Node — Metaplex mint (not compatible with Edge) */
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!authorizeInternalApi(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await request.json()) as { signalId?: string };
    const signalId = String(body.signalId ?? "").trim();
    if (!signalId) {
      return new Response(JSON.stringify({ error: "signalId required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { getSignalById } = await import("./lib/signal-store");
    const signal = await getSignalById(signalId);
    if (!signal) {
      return new Response(JSON.stringify({ error: "Signal not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { mintSolanaSignalNftForSignal } = await import("./lib/rwa-solana-mint");
    const solanaNft = await mintSolanaSignalNftForSignal(signal);

    return new Response(JSON.stringify({ ok: true, solanaNft }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[lounge-rwa-mint-sol]", e instanceof Error ? e.stack || e.message : e);
    return new Response(JSON.stringify({ error: sanitizePublicError(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
