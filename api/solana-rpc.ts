import { corsHeadersFor } from "./lib/concierge-security";
import { getSolanaRpcUrlForServer } from "./lib/x402-config";
import { solanaRpcCall } from "./lib/x402-solana-rpc";

export const config = {
  runtime: "edge",
};

const ALLOWED_METHODS = new Set([
  "getLatestBlockhash",
  "getAccountInfo",
  "getTokenAccountsByOwner",
  "simulateTransaction",
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
  if (!ALLOWED_METHODS.has(method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const rpc = getSolanaRpcUrlForServer();
  const result = await solanaRpcCall<unknown>(rpc, method, body.params ?? []);
  if (result === null) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id ?? 1,
        error: { code: -32000, message: "Solana RPC request failed" },
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
      result,
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
