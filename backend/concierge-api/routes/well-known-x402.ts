import {
  buildWellKnownX402Document,
  discoveryCorsHeaders,
  resolveX402SiteOrigin,
} from "../x402-discovery";
import { withEdgeCache } from "../edge-response-cache";

export default async function handler(request: Request): Promise<Response> {
  const cors = discoveryCorsHeaders();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const origin = resolveX402SiteOrigin(request);
  const body = await withEdgeCache("well-known-x402", origin, 300_000, async () =>
    buildWellKnownX402Document(origin),
  );

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
