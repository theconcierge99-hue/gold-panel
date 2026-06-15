import { corsHeadersFor } from "../concierge-security";
import { getSolanaRpcUrlForServer } from "../x402-config";
import { getSolUsdcBalanceAtomic } from "../x402-solana-rpc";

const OWNER_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

  const owner = new URL(request.url).searchParams.get("owner")?.trim() ?? "";
  if (!OWNER_RE.test(owner)) {
    return new Response(JSON.stringify({ error: "Invalid Solana address" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const rpc = getSolanaRpcUrlForServer();
  const balanceAtomic = await getSolUsdcBalanceAtomic(owner, rpc);

  return new Response(
    JSON.stringify({
      owner,
      balanceAtomic: balanceAtomic === null ? null : balanceAtomic.toString(),
      ok: balanceAtomic !== null,
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
