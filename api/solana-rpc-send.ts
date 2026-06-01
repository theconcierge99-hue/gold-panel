import { corsHeadersFor } from "./lib/concierge-security";
import { getSolanaRpcUrlForServer } from "./lib/x402-config";
import { solanaRpcCallEx } from "./lib/x402-solana-rpc";

/** Edge — forward Solana JSON-RPC for client NFT mint (creator signs in Phantom) */
export const config = { runtime: "edge" };

const BLOCKED = new Set(["requestAirdrop"]);

const SLOW_METHODS = new Set(["simulateTransaction", "sendTransaction", "getLatestBlockhash"]);

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
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const method = body.method?.trim() ?? "";
  if (!method || BLOCKED.has(method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rpc = getSolanaRpcUrlForServer();
  const timeoutMs = SLOW_METHODS.has(method) ? 55_000 : 20_000;
  const out = await solanaRpcCallEx<unknown>(rpc, method, body.params ?? [], timeoutMs);

  return new Response(
    JSON.stringify(
      out.ok
        ? { jsonrpc: "2.0", id: body.id ?? 1, result: out.result }
        : {
            jsonrpc: "2.0",
            id: body.id ?? 1,
            error: { code: -32000, message: out.error },
          },
    ),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
