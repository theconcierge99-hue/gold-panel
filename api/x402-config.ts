import { corsHeadersFor } from "./lib/concierge-security";
import { getPublicX402Config } from "./lib/x402-config";

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
  return new Response(JSON.stringify(getPublicX402Config()), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
