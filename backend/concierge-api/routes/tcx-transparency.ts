import { siteOriginFromRequest } from "../agent-readiness";
import { corsHeadersFor } from "../concierge-security";
import { withEdgeCache } from "../edge-response-cache";
import { buildTcxTransparencyPayload } from "../tcx-transparency-core";

const CACHE_MS = 3_600_000;

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
    const url = new URL(request.url);
    const bypass = url.searchParams.get("live") === "1";
    const body = bypass
      ? await buildTcxTransparencyPayload(origin)
      : await withEdgeCache("tcx-transparency", origin, CACHE_MS, async () =>
          buildTcxTransparencyPayload(origin),
        );

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_MS / 1000}, stale-while-revalidate=600`,
      },
    });
  } catch (e) {
    console.error("[tcx-transparency]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "TCX transparency unavailable" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
