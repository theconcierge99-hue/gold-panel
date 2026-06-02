import { buildLoungeServiceCard, resolveOrigin } from "./lib/agent-identity-card";
import { corsHeadersFor } from "./lib/concierge-security";

export const config = { runtime: "edge" };

/** Service-level agent registry card (like HYRE agent-card / ERC-8004 discovery). */
export default async function handler(request: Request): Promise<Response> {
  const cors = {
    ...corsHeadersFor(request),
    "Access-Control-Allow-Origin": "*",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const card = buildLoungeServiceCard(resolveOrigin(request));
  return new Response(JSON.stringify(card, null, 2), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  });
}
