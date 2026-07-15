import { buildAgentCard, buildErc8004RegistrationFile, resolveOrigin } from "../agent-identity-card";
import { corsHeadersFor, readBodyWithLimit, sanitizePublicError } from "../concierge-security";
import { getAgentById, linkAgentErc8004, toPublicView } from "../agent-identity-store";
import {
  agentRegistryCaip,
  agentUriMatches,
  ERC8004_DEFAULT_CHAIN_ID,
  ERC8004_IDENTITY_ABI,
  ERC8004_IDENTITY_REGISTRY,
  readIdentityOnChain,
  registrationFileUrl,
  type Erc8004LinkRecord,
} from "../erc-8004";

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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extra,
    },
  });
}

/**
 * GET  — prepare Base Identity Registry register(agentURI) payload
 * POST — verify on-chain mint and link to Concierge `agt_…`
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeadersFor(request),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const origin = resolveOrigin(request);

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const id = url.searchParams.get("id")?.trim();
      if (!id) return json(request, { error: "id query parameter required" }, 400);
      const agent = await getAgentById(id);
      if (!agent) return json(request, { error: "Agent not found" }, 404);
      if (!agent.evmAddress) {
        return json(request, { error: "Agent needs an EVM address to mint on Base ERC-8004" }, 400);
      }

      const agentURI = registrationFileUrl(origin, agent.id);
      return json(
        request,
        {
          ok: true,
          chainId: ERC8004_DEFAULT_CHAIN_ID,
          network: "eip155:8453",
          registry: ERC8004_IDENTITY_REGISTRY,
          agentRegistry: agentRegistryCaip(ERC8004_DEFAULT_CHAIN_ID, ERC8004_IDENTITY_REGISTRY),
          agentURI,
          functionName: "register",
          abi: ERC8004_IDENTITY_ABI,
          args: [agentURI],
          ownerHint: agent.evmAddress,
          alreadyLinked: Boolean(agent.erc8004),
          linked: agent.erc8004 ?? null,
          registrationPreview: buildErc8004RegistrationFile(origin, agent),
          gasHint:
            "Mint on Base mainnet. Fund the agent EVM wallet with a little ETH on Base for gas, then call register(agentURI).",
          explorerRegistry: `https://basescan.org/address/${ERC8004_IDENTITY_REGISTRY}`,
        },
        200,
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
    const id = String(body.id ?? "").trim();
    const onChainAgentId = String(body.agentId ?? body.onChainAgentId ?? "").trim();
    const txHash = String(body.txHash ?? "").trim();
    if (!id) return json(request, { error: "id is required" }, 400);
    if (!/^\d+$/.test(onChainAgentId)) {
      return json(request, { error: "agentId must be the on-chain ERC-8004 tokenId (integer)" }, 400);
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return json(request, { error: "txHash must be a 0x-prefixed 32-byte hash" }, 400);
    }

    const agent = await getAgentById(id);
    if (!agent) return json(request, { error: "Agent not found" }, 404);
    if (!agent.evmAddress) {
      return json(request, { error: "Agent has no EVM address to verify ownership" }, 400);
    }

    const expectedUri = registrationFileUrl(origin, agent.id);
    const onChain = await readIdentityOnChain({
      chainId: ERC8004_DEFAULT_CHAIN_ID,
      agentId: onChainAgentId,
      registry: ERC8004_IDENTITY_REGISTRY,
    });
    if (!onChain) {
      return json(
        request,
        { error: "Could not read Identity Registry — check agentId / Base RPC" },
        400,
      );
    }
    if (onChain.owner !== agent.evmAddress.toLowerCase()) {
      return json(
        request,
        {
          error: `On-chain owner ${onChain.owner} does not match agent EVM ${agent.evmAddress}`,
        },
        400,
      );
    }
    if (!agentUriMatches(expectedUri, onChain.tokenURI)) {
      return json(
        request,
        {
          error: `tokenURI mismatch. Expected ${expectedUri}, on-chain ${onChain.tokenURI}`,
        },
        400,
      );
    }

    const link: Erc8004LinkRecord = {
      chainId: ERC8004_DEFAULT_CHAIN_ID,
      registry: ERC8004_IDENTITY_REGISTRY,
      agentId: onChainAgentId,
      agentRegistry: agentRegistryCaip(ERC8004_DEFAULT_CHAIN_ID, ERC8004_IDENTITY_REGISTRY),
      agentURI: onChain.tokenURI,
      txHash: txHash.toLowerCase(),
      owner: onChain.owner,
      linkedAt: new Date().toISOString(),
    };

    const updated = await linkAgentErc8004(id, link);
    if (!updated) return json(request, { error: "Failed to persist ERC-8004 link" }, 500);

    return json(
      request,
      {
        ok: true,
        agent: toPublicView(origin, updated),
        card: buildAgentCard(origin, updated),
        registration: buildErc8004RegistrationFile(origin, updated),
        message: "ERC-8004 Identity linked on Base. agentURI now lists registrations[].",
      },
      200,
    );
  } catch (e) {
    const msg = sanitizePublicError(e);
    return json(request, { error: msg }, msg.includes("too large") ? 413 : 500);
  }
}
