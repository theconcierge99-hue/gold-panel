import { siteOriginFromRequest } from "../agent-readiness";
import { corsHeadersFor } from "../concierge-security";
import { buildTcxHolderPayload } from "../tcx-health-core";

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

  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet") ?? url.searchParams.get("address") ?? "";

  if (!wallet.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing wallet query param", code: "missing_wallet" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  try {
    const origin = siteOriginFromRequest(request);
    const body = await buildTcxHolderPayload(origin, wallet);
    const status = body.ok ? 200 : body.code === "invalid_wallet" ? 400 : 502;
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[tcx-holder]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "TCX holder lookup failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
