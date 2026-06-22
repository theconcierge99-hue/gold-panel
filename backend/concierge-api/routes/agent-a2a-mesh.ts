/**
 * Free A2A mesh discovery — registered agents + pipeline templates + hub metadata.
 * GET /api/agent-a2a-mesh
 */
import { buildA2aMeshDocument } from "../a2a-mesh";
import { listAgents } from "../agent-identity-store";
import { resolveOrigin } from "../agent-identity-card";
import { corsHeadersFor } from "../concierge-security";

export default async function handleAgentA2aMesh(request: Request): Promise<Response> {
  const cors = {
    ...corsHeadersFor(request),
    "Access-Control-Allow-Origin": "*",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed", code: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const origin = resolveOrigin(request);
  const limit = Math.min(48, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || "24")));
  const agents = await listAgents(limit);
  const mesh = buildA2aMeshDocument(
    origin,
    agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      solAddress: a.solAddress,
      evmAddress: a.evmAddress,
      createdAt: a.createdAt,
      cardUrl: `${origin.replace(/\/$/, "")}/api/agent-identity-card?id=${encodeURIComponent(a.id)}`,
      profileUrl: `${origin.replace(/\/$/, "")}/api/agent-identity?id=${encodeURIComponent(a.id)}`,
    })),
  );

  return new Response(JSON.stringify({ ok: true, ...mesh }), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
