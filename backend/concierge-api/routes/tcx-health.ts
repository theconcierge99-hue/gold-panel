import { siteOriginFromRequest } from "../agent-readiness";
import { corsHeadersFor } from "../concierge-security";
import { buildTcxHealthPayload } from "../tcx-health-core";

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
    const origin = siteOriginFromRequest(request);
    const body = await buildTcxHealthPayload(origin);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error("[tcx-health]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "TCX health unavailable" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
