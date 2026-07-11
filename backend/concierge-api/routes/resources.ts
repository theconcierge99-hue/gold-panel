import { discoveryCorsHeaders } from "../x402-discovery";
import { buildResourcesCatalog } from "../concierge-resources-catalog";
import { siteOriginFromRequest } from "../agent-readiness";

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

  const origin = siteOriginFromRequest(request);
  const catalog = buildResourcesCatalog(origin);

  return new Response(JSON.stringify(catalog), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
