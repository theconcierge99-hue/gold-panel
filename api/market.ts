import { fetchLiveMarketSnapshot, ticksForUi } from "./lib/market-data";
import { assertAllowedOrigin, corsHeadersFor, sanitizePublicError } from "./lib/concierge-security";

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
    const snapshot = await fetchLiveMarketSnapshot();
    return new Response(
      JSON.stringify({
        fetchedAt: snapshot.fetchedAt,
        ticks: ticksForUi(snapshot),
        derivatives: snapshot.derivatives,
        sources: snapshot.sources,
      }),
      {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30",
        },
      },
    );
  } catch (e) {
    const msg = sanitizePublicError(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
