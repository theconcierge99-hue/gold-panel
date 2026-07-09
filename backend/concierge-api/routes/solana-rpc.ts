import { corsHeadersFor } from "../concierge-security";
import { solanaRpcCallWithFallback } from "../x402-solana-rpc";

/** Read-only RPC forwarded to Helius — blocks transaction submission from browser */
const BLOCKED_METHODS = new Set([
  "sendTransaction",
  "simulateTransaction",
  "signTransaction",
]);

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { method?: string; params?: unknown[]; id?: number };
  try {
    body = (await request.json()) as { method?: string; params?: unknown[]; id?: number };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const method = body.method?.trim() ?? "";
  if (!method || BLOCKED_METHODS.has(method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const out = await solanaRpcCallWithFallback<unknown>(method, body.params ?? [], 20_000);
  if (!out.ok) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id ?? 1,
        error: { code: -32000, message: out.error },
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: body.id ?? 1,
      result: out.result,
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
