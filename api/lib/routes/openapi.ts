import {
  buildOpenApiDocument,
  discoveryCorsHeaders,
  resolveX402SiteOrigin,
} from "../x402-discovery";

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
  const doc = buildOpenApiDocument(origin);

  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
