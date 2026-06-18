/**
 * GET /api/concierge-intel-accuracy — public verdict accuracy leaderboard (free).
 */
import { corsHeadersFor } from "../concierge-security";
import { getVerdictAccuracyLeaderboard } from "../verdict-accuracy";

export default async function handleIntelAccuracy(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    const payload = await getVerdictAccuracyLeaderboard();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Leaderboard unavailable" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
