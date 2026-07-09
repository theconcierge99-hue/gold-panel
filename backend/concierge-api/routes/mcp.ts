/**
 * MCP HTTP transport — tools/list + tools/call for Concierge intel (x402-aware).
 * POST /api/mcp · discovery GET /api/mcp
 */
import { corsHeadersFor } from "../concierge-security";
import {
  ALL_X402_RESOURCE_KINDS,
  isIntelResourceKind,
  isSecurityResourceKind,
  priceLabelForResource,
  priceUsdcForResource,
  type X402ResourceKind,
} from "../x402-pricing";
import { resolveIntelKindFromRequest, handleConciergeIntelRoute } from "../concierge-intel-handler";
import { handleConciergeSecurityRoute } from "../concierge-security-handler";
import { withEdgeCache } from "../edge-response-cache";

const MCP_VERSION = "2024-11-05";
const SERVER_NAME = "concierge-intel";
const SERVER_VERSION = "1.0.0";

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const INTEL_TOOL_BODIES: Partial<Record<X402ResourceKind, Record<string, unknown>>> = {
  "intel-tvl": {},
  "intel-macro": {},
  "intel-wire": { limit: 10 },
  "intel-yields": { chain: "solana", project: "meteora" },
  "intel-whales": { symbols: ["BTC", "ETH", "SOL"] },
  "intel-verdict": { message: "Solana DeFi outlook", includeInsider: true },
  "intel-meteora": { sortByApy: true, limit: 8 },
  "intel-desk-brief": { message: "morning desk brief", includeInsider: true },
  "intel-a2a-pipeline": { message: "Solana desk A2A orchestration", includeInsider: true },
  "intel-scalp": { symbols: ["BTC", "SOL"], intervals: ["5m", "15m"] },
  "security-readiness": {
    target: "https://api.example.com",
    allowlist: ["*.example.com"],
    authorized: true,
  },
  "security-headers": {
    target: "https://app.example.com",
    allowlist: ["*.example.com"],
    authorized: true,
  },
  "security-scan": {
    target: "https://api.example.com",
    allowlist: ["*.example.com"],
    authorized: true,
  },
};

function siteOrigin(request: Request): string {
  const host = request.headers.get("host") || "conc-exe.xyz";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function buildTools(origin: string): McpTool[] {
  const tools: McpTool[] = [];
  for (const kind of ALL_X402_RESOURCE_KINDS) {
    if (!isIntelResourceKind(kind) && !isSecurityResourceKind(kind)) continue;
    const path = `/api/concierge-${kind}`;
    const price = priceLabelForResource(kind);
    tools.push({
      name: kind.replace(/-/g, "_"),
      description: `${kind} — ${price} USDC x402. POST ${origin}${path}`,
      inputSchema: {
        type: "object",
        properties: {
          body: {
            type: "object",
            description: "JSON POST body",
            default: INTEL_TOOL_BODIES[kind] ?? {},
          },
          paymentSignature: {
            type: "string",
            description: "Base64 PAYMENT-SIGNATURE header after x402 settlement",
          },
        },
      },
    });
  }
  return tools;
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export default async function handleMcp(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  const origin = siteOrigin(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const body = await withEdgeCache("mcp-discovery", origin, 300_000, async () => {
      const tools = buildTools(origin);
      return {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        protocolVersion: MCP_VERSION,
        transport: "http",
        endpoint: `${origin}/api/mcp`,
        tools: tools.length,
        note: "POST JSON-RPC 2.0 with methods initialize | tools/list | tools/call. Pass paymentSignature after x402 pay.",
        payShExample: `pay curl ${origin}/api/concierge-intel-tvl -d '{}'`,
      };
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    rpc = (await request.json()) as typeof rpc;
  } catch {
    return new Response(JSON.stringify(jsonRpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { id, method, params } = rpc;

  if (method === "initialize") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  if (method === "tools/list") {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id, result: { tools: buildTools(origin) } }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  if (method === "tools/call") {
    const toolName = String(params?.name ?? "");
    const kind = toolName.replace(/_/g, "-") as X402ResourceKind;
    if (!isIntelResourceKind(kind) && !isSecurityResourceKind(kind)) {
      return new Response(
        JSON.stringify(jsonRpcError(id, -32602, `Unknown tool: ${toolName}`)),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const args = (params?.arguments ?? {}) as {
      body?: Record<string, unknown>;
      paymentSignature?: string;
    };
    const paymentSignature =
      String(args.paymentSignature ?? "").trim() ||
      request.headers.get("payment-signature") ||
      request.headers.get("PAYMENT-SIGNATURE") ||
      "";

    if (!paymentSignature) {
      const path = `/api/concierge-${kind}`;
      const price = priceUsdcForResource(kind);
      const defaultBody = INTEL_TOOL_BODIES[kind] ?? {};
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: [
                  `Payment required: ${priceLabelForResource(kind)} USDC via x402.`,
                  `POST ${origin}${path}`,
                  `Body: ${JSON.stringify(args.body ?? defaultBody)}`,
                  `CLI: pay curl ${origin}${path} -d '${JSON.stringify(args.body ?? defaultBody)}'`,
                  "Retry tools/call with arguments.paymentSignature (base64 PAYMENT-SIGNATURE).",
                ].join("\n"),
              },
            ],
            isError: false,
            _meta: { paymentRequired: true, priceUsdc: price, path, kind },
          },
        }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const path = `/api/concierge-${kind}`;
    const bodyJson = JSON.stringify(args.body ?? INTEL_TOOL_BODIES[kind] ?? {});
    const proxyReq = new Request(`${origin}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(bodyJson).length),
        "PAYMENT-SIGNATURE": paymentSignature,
        Origin: origin,
      },
      body: bodyJson,
    });

    const intelKind = resolveIntelKindFromRequest(proxyReq);
    const securityKind = isSecurityResourceKind(kind) ? kind : null;

    if (!intelKind && !securityKind) {
      return new Response(
        JSON.stringify(jsonRpcError(id, -32603, "Route resolution failed")),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const res = intelKind
      ? await handleConciergeIntelRoute(proxyReq, intelKind)
      : await handleConciergeSecurityRoute(proxyReq, securityKind!);
    const text = await res.text();
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
          isError: res.status >= 400,
          _meta: { httpStatus: res.status, kind },
        },
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify(jsonRpcError(id, -32601, "Method not found")), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
