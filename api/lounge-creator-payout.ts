import { corsHeadersFor, sanitizePublicError } from "./lib/concierge-security";
import { authorizeInternalApi } from "./lib/lounge-internal-auth";
import type { CreatorPayoutResult } from "./lib/creator-payout-types";

/** Node — SPL / ERC-20 creator share (not compatible with Edge) */
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

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
  if (!authorizeInternalApi(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await request.json()) as {
      creatorWallet?: string;
      creatorChain?: "sol" | "evm";
      shareAtomic?: string;
    };
    const creatorWallet = String(body.creatorWallet ?? "").trim();
    const creatorChain = body.creatorChain;
    const shareAtomic = String(body.shareAtomic ?? "").trim();

    if (!creatorWallet || (creatorChain !== "sol" && creatorChain !== "evm") || !shareAtomic) {
      return new Response(JSON.stringify({ error: "Invalid payout body" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { disburseCreatorInstantShare } = await import("./lib/creator-instant-payout");
    const payout: CreatorPayoutResult = await disburseCreatorInstantShare({
      creatorWallet,
      creatorChain,
      shareAtomic,
    });

    return new Response(JSON.stringify({ ok: true, payout }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[lounge-creator-payout]", e instanceof Error ? e.stack || e.message : e);
    return new Response(JSON.stringify({ error: sanitizePublicError(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
