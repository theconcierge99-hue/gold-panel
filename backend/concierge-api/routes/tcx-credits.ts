import { siteOriginFromRequest } from "../agent-readiness";
import { corsHeadersFor } from "../concierge-security";
import { buildTcxHolderPayload } from "../tcx-health-core";
import {
  ensureTcxWelcomeCredits,
  getTcxCreditsProfile,
  tcxCreditsEnabled,
} from "../tcx-credits-store";
import { creditsCostForResource, MVP_RESOURCE_KINDS } from "../x402-pricing";

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
    const holder = await buildTcxHolderPayload(origin, wallet);
    const profile = tcxCreditsEnabled()
      ? await ensureTcxWelcomeCredits(wallet)
      : await getTcxCreditsProfile(wallet);

    const resourceCosts = Object.fromEntries(
      MVP_RESOURCE_KINDS.map((k) => [k, creditsCostForResource(k)]),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        enabled: tcxCreditsEnabled(),
        wallet: profile.wallet,
        balanceCredits: profile.balanceCredits,
        balanceUsd: (profile.balanceCredits / 100).toFixed(2),
        totalSpentCredits: profile.totalSpentCredits,
        totalGrantedCredits: profile.totalGrantedCredits,
        welcomeGranted: profile.welcomeGranted,
        holder: holder.ok ? { tier: holder.tier, balanceUi: holder.balanceUi } : null,
        resourceCosts,
        usage: {
          header: "x-tcx-credits-wallet",
          note: "Send on POST to resource-chat, resource-image, or resource-scaffold to spend credits instead of x402.",
        },
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    console.error("[tcx-credits]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "TCX credits lookup failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
