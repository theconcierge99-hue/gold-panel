import { buildLoungeServiceCard, resolveOrigin } from "../agent-identity-card";
import { corsHeadersFor } from "../concierge-security";
import { withEdgeCache } from "../edge-response-cache";

/** Service-level agent registry card (HTTP A2A discovery — not on-chain ERC-8004). */
export default async function handler(request: Request): Promise<Response> {
  const cors = {
    ...corsHeadersFor(request),
    "Access-Control-Allow-Origin": "*",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const origin = resolveOrigin(request);
  const card = await withEdgeCache("well-known-agent-card", origin, 600_000, async () =>
    buildLoungeServiceCard(origin),
  );
  return new Response(JSON.stringify(card, null, 2), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  });
}
