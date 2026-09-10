/**
 * Free lite trenches research for Lounge UI — capped fields; full report via x402 intel-trenches.
 */
import { corsHeadersFor } from "../concierge-security";
import { runTrenchesIntel, runTrenchesScreen } from "../concierge-trenches-intel";

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    let body: Record<string, unknown> = {};
    if (request.method === "POST") {
      try {
        const raw = await request.json();
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          body = raw as Record<string, unknown>;
        }
      } catch {
        body = {};
      }
    }

    const mode = String(
      body.view ?? url.searchParams.get("view") ?? "desk",
    ).toLowerCase();

    if (mode === "screen") {
      const payload = await runTrenchesScreen({
        chain: String(body.chain ?? url.searchParams.get("chain") ?? "solana"),
        limit: Number(body.limit ?? url.searchParams.get("limit") ?? 12),
        maxMcapUsd: Number(body.maxMcapUsd ?? url.searchParams.get("maxMcapUsd") ?? 2_000_000),
        meta: String(body.meta ?? url.searchParams.get("meta") ?? "") || undefined,
      });
      return new Response(
        JSON.stringify({
          ...payload,
          mode: "lite",
          note: "Lounge lite screen — full intel-trenches-screen via x402 for agents.",
        }),
        {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
          },
        },
      );
    }

    const address = String(
      body.address ?? url.searchParams.get("address") ?? body.message ?? "",
    ).trim();
    if (!address) {
      return new Response(
        JSON.stringify({ error: "address query/body required for desk view" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const verdict = await runTrenchesIntel({
      address,
      chain: String(body.chain ?? url.searchParams.get("chain") ?? "solana"),
      mode: "lite",
    });

    return new Response(
      JSON.stringify({
        ...verdict,
        note: "Lounge lite verdict — pay intel-trenches for full whale/safety detail.",
      }),
      {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Trenches research unavailable";
    const status =
      msg.includes("required") ||
      msg.includes("No DexScreener") ||
      msg.includes("Pump.fun coin found")
        ? 400
        : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
