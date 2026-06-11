import { corsHeadersFor } from "../concierge-security";
import { getPublicPrivyConfig } from "../privy-env";

/** Public Privy client config — app ID + client ID are safe to expose in the browser. */
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
  const config = await getPublicPrivyConfig();
  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
