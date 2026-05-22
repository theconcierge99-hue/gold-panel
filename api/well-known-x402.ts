import {
  buildWellKnownX402Document,
  discoveryCorsHeaders,
  resolveX402SiteOrigin,
} from "./lib/x402-discovery";

export const config = { runtime: "edge" };

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
  const body = buildWellKnownX402Document(origin);

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
