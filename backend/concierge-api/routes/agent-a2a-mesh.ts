/**
 * Free A2A mesh discovery — registered agents + pipeline templates + hub metadata.
 * GET /api/agent-a2a-mesh
 */
import { buildA2aMeshDocument } from "../a2a-mesh";
import { listAgents, toPublicView } from "../agent-identity-store";
import { resolveOrigin } from "../agent-identity-card";
import { corsHeadersFor } from "../concierge-security";
import { withEdgeCache } from "../edge-response-cache";

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
  const mesh = await withEdgeCache("agent-a2a-mesh", `${origin}:${limit}`, 120_000, async () => {
    const agents = await listAgents(limit);
    return buildA2aMeshDocument(
      origin,
      agents.map((a) => toPublicView(origin, a)),
    );
  });

  return new Response(JSON.stringify({ ok: true, ...mesh }), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
