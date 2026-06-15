import { fetchMeteoraDlmmPools } from "../dlmm-pools";
import { corsHeadersFor } from "../concierge-security";
import { evaluateSoonGate } from "../soon-token";

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

  const url = new URL(request.url);
  const owner = url.searchParams.get("owner")?.trim() ?? "";
  const sortApy = url.searchParams.get("sort") === "apy";

  const gate = await evaluateSoonGate(OWNER_RE.test(owner) ? owner : null);

  let pools: Awaited<ReturnType<typeof fetchMeteoraDlmmPools>> = [];
  try {
    pools = await fetchMeteoraDlmmPools({ limit: 16, sortByApy: sortApy });
  } catch (e) {
    console.warn("[dlmm-config] pool fetch", e);
  }

  return new Response(
    JSON.stringify({
      mode: "manual",
      description:
        "Manual DLMM bot — you sign every liquidity action in your connected wallet. No server-side keys.",
      soon: gate,
      pools,
      actions: {
        addLiquidity: gate.dlmmUnlocked,
        removeLiquidity: gate.dlmmUnlocked,
        rebalance: gate.dlmmUnlocked,
      },
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
