import { corsHeadersFor } from "./lib/concierge-security";
import { getPublicX402ConfigAsync } from "./lib/x402-config";

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
  try {
    const body = await getPublicX402ConfigAsync();
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[x402-config]", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({
        enabled: false,
        paymentsRequested: true,
        configWarning: "x402 config failed to load — check Vercel env and redeploy",
        error: e instanceof Error ? e.message : "internal_error",
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  }
}
