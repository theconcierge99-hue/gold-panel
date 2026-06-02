import { buildAgentCard, resolveOrigin } from "./lib/agent-identity-card";
import { corsHeadersFor, sanitizePublicError } from "./lib/concierge-security";
import { getAgentById } from "./lib/agent-identity-store";

export const config = { runtime: "edge" };

/** ERC-8004-style agent card JSON for one registered agent. */
export default async function handler(request: Request): Promise<Response> {
  const cors = {
    ...corsHeadersFor(request),
    "Access-Control-Allow-Origin": "*",
  };

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
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) {
      return new Response(JSON.stringify({ error: "id query parameter required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const agent = await getAgentById(id);
    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const card = buildAgentCard(resolveOrigin(request), agent);
    return new Response(JSON.stringify(card), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: sanitizePublicError(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
