import { corsHeadersFor } from "../concierge-security";
import { getSolanaRpcUrlForServer } from "../x402-config";
import { getSolTokenBalanceAtomic, getSolUsdcBalanceAtomic } from "../x402-solana-rpc";
import { getSoonMint } from "../soon-token";

const OWNER_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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
  const owner = url.searchParams.get("owner")?.trim() ?? "";
  const mintParam = url.searchParams.get("mint")?.trim() ?? "";
  if (!OWNER_RE.test(owner)) {
    return new Response(JSON.stringify({ error: "Invalid Solana address" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const rpc = getSolanaRpcUrlForServer();
  const soonMint = getSoonMint();
  const mint = mintParam && MINT_RE.test(mintParam) ? mintParam : null;
  const balanceAtomic =
    mint && mint === soonMint
      ? await getSolTokenBalanceAtomic(owner, mint, rpc)
      : await getSolUsdcBalanceAtomic(owner, rpc);

  return new Response(
    JSON.stringify({
      owner,
      mint: mint && mint === soonMint ? mint : "USDC",
      balanceAtomic: balanceAtomic === null ? null : balanceAtomic.toString(),
      ok: balanceAtomic !== null,
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
