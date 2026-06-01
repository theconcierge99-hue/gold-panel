import { corsHeadersFor } from "./lib/concierge-security";
import { getSolanaRpcUrlForServer } from "./lib/x402-config";
import { solanaRpcCall } from "./lib/x402-solana-rpc";

/** Edge — forward sendTransaction / simulateTransaction for client NFT mint only */
export const config = { runtime: "edge" };

/** Allow reads + submitting already-signed txs from the creator's wallet */
const BLOCKED = new Set(["requestAirdrop"]);

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
  const result = await solanaRpcCall<unknown>(rpc, method, body.params ?? []);

  return new Response(
    JSON.stringify(
      result === null
        ? { jsonrpc: "2.0", id: body.id ?? 1, error: { code: -32000, message: "RPC failed" } }
        : { jsonrpc: "2.0", id: body.id ?? 1, result },
    ),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
