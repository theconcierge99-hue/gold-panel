import { siteOriginFromRequest } from "../agent-readiness";
import { corsHeadersFor } from "../concierge-security";
import {
  buildSeasonLeaderboard,
  buildSeasonSummaryPayload,
  buildSeasonWalletPayload,
  getSeasonConfig,
  seasonStatus,
} from "../tcx-season-core";

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
  const origin = siteOriginFromRequest(request);
  const wallet = (url.searchParams.get("wallet") ?? url.searchParams.get("address") ?? "").trim();
  const leaderboard = ["1", "true", "yes"].includes(
    (url.searchParams.get("leaderboard") ?? "").trim().toLowerCase(),
  );
  const limit = Number(url.searchParams.get("limit") ?? "50");

  try {
    const cfg = getSeasonConfig();
    const status = seasonStatus(cfg);

    if (wallet) {
      const result = await buildSeasonWalletPayload(wallet, cfg);
      if (!result.ok) {
        return new Response(JSON.stringify(result), {
          status: result.code === "invalid_wallet" ? 400 : 502,
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      return new Response(
        JSON.stringify({
          version: 1,
          season: "tcx-season-2026",
          status,
          config: {
            startDate: cfg.startDate,
            snapshotAt: cfg.snapshotAt,
            minCalls: cfg.minCalls,
            callCap: cfg.callCap,
            minHoldDays: cfg.minHoldDays,
          },
          ...result.score,
        }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
        },
      );
    }

    if (leaderboard) {
      const rows = await buildSeasonLeaderboard(limit, cfg);
      return new Response(
        JSON.stringify({
          version: 1,
          season: "tcx-season-2026",
          status,
          config: {
            startDate: cfg.startDate,
            snapshotAt: cfg.snapshotAt,
            minCalls: cfg.minCalls,
            callCap: cfg.callCap,
            minHoldDays: cfg.minHoldDays,
          },
          leaderboard: rows.map((r) => ({
            wallet: r.wallet,
            points: r.points,
            paidCalls: r.paidCalls,
            tier: r.tier,
            eligible: r.eligibility.eligible,
            lastAt: r.lastAt,
          })),
        }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
        },
      );
    }

    const summary = await buildSeasonSummaryPayload(origin);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    console.error("[tcx-season]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "TCX Season lookup failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
