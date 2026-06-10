import { buildAgentCard, resolveOrigin } from "../agent-identity-card";
import { corsHeadersFor, readBodyWithLimit, sanitizePublicError } from "../concierge-security";
import {
  normalizeEvmAddress,
  normalizeSolAddress,
  registerAgent,
  getAgentById,
  listAgents,
  toPublicView,
} from "../agent-identity-store";

function json(
  request: Request,
  body: unknown,
  status: number,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

function agentCors(request: Request): Record<string, string> {
  const base = corsHeadersFor(request);
  return {
    ...base,
    "Access-Control-Allow-Origin": request.headers.get("origin") && base["Access-Control-Allow-Origin"] !== "*"
      ? base["Access-Control-Allow-Origin"]
      : "*",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Agent-Id, payment-signature, PAYMENT-SIGNATURE, PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  };
}

export default async function handler(request: Request): Promise<Response> {
  const cors = agentCors(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const origin = resolveOrigin(request);

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.searchParams.get("list") === "1" || url.searchParams.get("list") === "true") {
        const limit = Number(url.searchParams.get("limit") || "24");
        const agents = await listAgents(limit);
        return new Response(
          JSON.stringify({
            ok: true,
            agents: agents.map((a) => toPublicView(origin, a)),
          }),
          {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=60",
            },
          },
        );
      }

      const id = url.searchParams.get("id")?.trim();
      if (!id) {
        return json(request, { error: "id query parameter required, or use ?list=1" }, 400);
      }
      const agent = await getAgentById(id);
      if (!agent) return json(request, { error: "Agent not found" }, 404);
      return new Response(
        JSON.stringify({
          ok: true,
          agent: toPublicView(origin, agent),
          card: buildAgentCard(origin, agent),
        }),
        {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=120",
          },
        },
      );
    }

    if (request.method !== "POST") {
      return json(request, { error: "Method not allowed" }, 405);
    }

    const raw = await readBodyWithLimit(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return json(request, { error: "Invalid JSON body" }, 400);
    }
    const body = raw as Record<string, unknown>;
    const name = String(body.name ?? "").trim().slice(0, 64);
    if (name.length < 2) return json(request, { error: "name must be at least 2 characters" }, 400);

    const description = String(body.description ?? "").trim().slice(0, 280) || undefined;
    const solRaw = String(body.solAddress ?? "").trim();
    const evmRaw = String(body.evmAddress ?? "").trim();
    const solAddress = solRaw ? normalizeSolAddress(solRaw) : null;
    const evmAddress = evmRaw ? normalizeEvmAddress(evmRaw) : null;

    if (solRaw && !solAddress) return json(request, { error: "Invalid Solana address" }, 400);
    if (evmRaw && !evmAddress) return json(request, { error: "Invalid EVM address (0x + 40 hex)" }, 400);
    if (!solAddress && !evmAddress) {
      return json(request, { error: "At least one of solAddress or evmAddress is required" }, 400);
    }

    const agent = await registerAgent({
      name,
      description,
      solAddress: solAddress ?? undefined,
      evmAddress: evmAddress ?? undefined,
    });

    const view = toPublicView(origin, agent);
    return json(
      request,
      {
        ok: true,
        agent: view,
        card: buildAgentCard(origin, agent),
        message:
          "Identity registered. Store private keys only on the agent — this server never receives secrets.",
      },
      200,
    );
  } catch (e) {
    const msg = sanitizePublicError(e);
    return json(request, { error: msg }, msg.includes("too large") ? 413 : 500);
  }
}
