import { buildErc8004RegistrationFile, resolveOrigin } from "../agent-identity-card";
import { corsHeadersFor, sanitizePublicError } from "../concierge-security";
import { getAgentById } from "../agent-identity-store";

/** EIP-8004 agentURI target — registration file JSON (HTTPS). */
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
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
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
    const origin = resolveOrigin(request);
    const file = buildErc8004RegistrationFile(origin, agent);
    return new Response(JSON.stringify(file), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": agent.erc8004 ? "public, max-age=120" : "public, max-age=30",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: sanitizePublicError(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
