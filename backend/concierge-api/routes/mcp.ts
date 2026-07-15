/**
 * MCP HTTP transport — tools/list + tools/call for Concierge intel (x402-aware).
 * POST /api/mcp · discovery GET /api/mcp
 *
 * Payment UX: always proxy to paid handlers so TCX / SOON free tiers can settle.
 * Unpaid calls return structured PAYMENT-REQUIRED (real accepts) for wallet / pay.sh.
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
import {
  INTEL_ROUTE_PATH,
  handleConciergeIntelRoute,
  type X402IntelKind,
} from "../concierge-intel-handler";
import {
  SECURITY_ROUTE_PATH,
  handleConciergeSecurityRoute,
  type X402SecurityKind,
} from "../concierge-security-handler";
import { buildPaymentRequiredResponse } from "../x402-server";
import { resourceUrlForOrigin } from "../x402-discovery";
import { withEdgeCache } from "../edge-response-cache";

const MCP_VERSION = "2024-11-05";
const SERVER_NAME = "concierge-intel";
const SERVER_VERSION = "1.1.0";

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
  "intel-wallet": { solAddress: "REPLACE_ME" },
  "intel-verdict": { message: "Solana DeFi outlook", includeInsider: true },
  "intel-airdrop": { message: "Solana ecosystem airdrop farming", limit: 5, includeInsider: true },
  "intel-listing": { message: "Potential exchange listings", limit: 5 },
  "intel-meteora": { sortByApy: true, limit: 8 },
  "intel-desk-brief": { message: "morning desk brief", includeInsider: true },
  "intel-a2a-pipeline": { message: "Solana desk A2A orchestration", includeInsider: true },
  "intel-scalp": { symbols: ["BTC", "SOL"], intervals: ["5m", "15m"] },
  "intel-momentum": {
    theme: "robinhood",
    message: "Robinhood Chain meme rotation — CASHCAT and Pump.fun cross-chain",
    limit: 5,
    includeInsider: true,
  },
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

const FREE_TOOLS: McpTool[] = [
  {
    name: "concierge_catalog",
    description:
      "Free — list Concierge MCP paid tools with USDC prices, HTTP paths, and pay.sh curl hints. Call before paying.",
    inputSchema: {
      type: "object",
      properties: {
        prefix: {
          type: "string",
          description: "Optional filter: intel | security",
        },
      },
    },
  },
  {
    name: "concierge_prepare_payment",
    description:
      "Free — return a live x402 PAYMENT-REQUIRED challenge (base64 accepts) for a paid tool kind so a wallet / pay.sh can settle before tools/call.",
    inputSchema: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: {
          type: "string",
          description: "Resource kind, e.g. intel-macro or security-scan (hyphens or underscores)",
        },
      },
    },
  },
];

const PAID_ARG_SCHEMA = {
  type: "object",
  properties: {
    body: {
      type: "object",
      description: "JSON POST body for the intel/security route",
    },
    paymentSignature: {
      type: "string",
      description:
        "Base64 PAYMENT-SIGNATURE after x402 settlement. Omit to receive a structured payment challenge (or settle via creditsWallet / SOON holder headers).",
    },
    creditsWallet: {
      type: "string",
      description: "Solana wallet for TCX prepaid credits (x-tcx-credits-wallet)",
    },
    soonHolderWallet: {
      type: "string",
      description: "Solana wallet for SOON/TCX holder free tier (X-Soon-Holder-Wallet)",
    },
    agentId: {
      type: "string",
      description: "Optional Concierge agent id (agt_…)",
    },
  },
} as const;

function siteOrigin(request: Request): string {
  const host = request.headers.get("host") || "conc-exe.xyz";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function pathForKind(kind: X402ResourceKind): string {
  if (isIntelResourceKind(kind)) return INTEL_ROUTE_PATH[kind];
  if (isSecurityResourceKind(kind)) return SECURITY_ROUTE_PATH[kind];
  return `/api/concierge-${kind}`;
}

function normalizeKind(raw: string): string {
  return raw.trim().replace(/_/g, "-");
}

function isPaidMcpKind(kind: string): kind is X402ResourceKind {
  return (
    (isIntelResourceKind(kind as X402ResourceKind) ||
      isSecurityResourceKind(kind as X402ResourceKind)) &&
    ALL_X402_RESOURCE_KINDS.includes(kind as X402ResourceKind)
  );
}

function buildPaidTools(origin: string): McpTool[] {
  const tools: McpTool[] = [];
  for (const kind of ALL_X402_RESOURCE_KINDS) {
    if (!isIntelResourceKind(kind) && !isSecurityResourceKind(kind)) continue;
    const path = pathForKind(kind);
    const price = priceLabelForResource(kind);
    const defaultBody = INTEL_TOOL_BODIES[kind] ?? {};
    tools.push({
      name: kind.replace(/-/g, "_"),
      description: `${kind} — ${price} USDC x402 (or TCX credits). POST ${origin}${path}. Default body: ${JSON.stringify(defaultBody)}. Unpaid calls return live PAYMENT-REQUIRED accepts.`,
      inputSchema: {
        ...PAID_ARG_SCHEMA,
        properties: {
          ...PAID_ARG_SCHEMA.properties,
          body: {
            ...PAID_ARG_SCHEMA.properties.body,
            default: defaultBody,
          },
        },
      },
    });
  }
  return tools;
}

function buildTools(origin: string): McpTool[] {
  return [...FREE_TOOLS, ...buildPaidTools(origin)];
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function jsonRpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function mcpJsonResponse(cors: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function payCurlFor(origin: string, kind: X402ResourceKind, body: Record<string, unknown>): string {
  const url = resourceUrlForOrigin(origin, kind);
  return `pay curl ${url} -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`;
}

type CallArgs = {
  body?: Record<string, unknown>;
  paymentSignature?: string;
  creditsWallet?: string;
  soonHolderWallet?: string;
  agentId?: string;
};

function pickHeader(request: Request, ...names: string[]): string {
  for (const name of names) {
    const v = request.headers.get(name);
    if (v?.trim()) return v.trim();
  }
  return "";
}

function resolveAuth(request: Request, args: CallArgs) {
  return {
    paymentSignature:
      String(args.paymentSignature ?? "").trim() ||
      pickHeader(request, "PAYMENT-SIGNATURE", "payment-signature"),
    creditsWallet:
      String(args.creditsWallet ?? "").trim() ||
      pickHeader(request, "x-tcx-credits-wallet", "X-Tcx-Credits-Wallet"),
    soonHolderWallet:
      String(args.soonHolderWallet ?? "").trim() ||
      pickHeader(request, "X-Soon-Holder-Wallet", "x-soon-holder-wallet"),
    agentId:
      String(args.agentId ?? "").trim() ||
      pickHeader(request, "X-Agent-Id", "x-agent-id", "x-concierge-agent-id"),
  };
}

async function formatPaymentChallenge(input: {
  id: unknown;
  origin: string;
  cors: Record<string, string>;
  kind: X402ResourceKind;
  body: Record<string, unknown>;
  challengeRes: Response;
}): Promise<Response> {
  const { id, origin, cors, kind, body, challengeRes } = input;
  const paymentRequired = challengeRes.headers.get("PAYMENT-REQUIRED") ?? "";
  let accepts: unknown[] = [];
  try {
    if (paymentRequired) {
      const binary = atob(paymentRequired);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { accepts?: unknown[] };
      accepts = Array.isArray(parsed.accepts) ? parsed.accepts : [];
    }
  } catch {
    accepts = [];
  }

  const path = pathForKind(kind);
  const price = priceUsdcForResource(kind);
  const challengeBody = await challengeRes.text();
  const payCurl = payCurlFor(origin, kind, body);

  const text = [
    `Payment required: ${priceLabelForResource(kind)} USDC via x402 (or TCX credits / SOON holder free tier).`,
    `POST ${origin}${path}`,
    `Body: ${JSON.stringify(body)}`,
    `CLI (easiest): ${payCurl}`,
    "Settle then retry this tool with arguments.paymentSignature = PAYMENT-SIGNATURE header value,",
    "or pass arguments.creditsWallet / soonHolderWallet, or set those headers on the MCP HTTP request.",
    paymentRequired
      ? `PAYMENT-REQUIRED (base64 challenge, ${accepts.length} accept(s)): ${paymentRequired.slice(0, 120)}${paymentRequired.length > 120 ? "…" : ""}`
      : "PAYMENT-REQUIRED header missing — call concierge_prepare_payment.",
    "SDK: npm i @conc-exe/agent — createConciergeAgent({ settlePayment }).",
  ].join("\n");

  return mcpJsonResponse(cors, {
    ...jsonRpcResult(id, {
      content: [
        { type: "text", text },
        {
          type: "text",
          text: JSON.stringify(
            {
              paymentRequired: true,
              kind,
              path,
              priceUsdc: price,
              payCurl,
              paymentRequiredHeader: paymentRequired || null,
              acceptCount: accepts.length,
              challengeBody: safeJson(challengeBody),
              retry: {
                paymentSignature: "<base64 PAYMENT-SIGNATURE after settle>",
                creditsWallet: "<optional solana pubkey>",
                soonHolderWallet: "<optional solana pubkey>",
              },
            },
            null,
            2,
          ),
        },
      ],
      isError: false,
      _meta: {
        paymentRequired: true,
        priceUsdc: price,
        path,
        kind,
        payCurl,
        paymentRequiredHeader: paymentRequired || null,
        acceptCount: accepts.length,
      },
    }),
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function handleCatalog(
  id: unknown,
  origin: string,
  cors: Record<string, string>,
  args: { prefix?: string },
): Promise<Response> {
  const prefix = String(args.prefix ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const rows = ALL_X402_RESOURCE_KINDS.filter(
    (kind) => isIntelResourceKind(kind) || isSecurityResourceKind(kind),
  )
    .filter((kind) => !prefix || kind.startsWith(prefix))
    .map((kind) => {
      const body = INTEL_TOOL_BODIES[kind] ?? {};
      const path = pathForKind(kind);
      return {
        tool: kind.replace(/-/g, "_"),
        kind,
        path,
        priceUsdc: priceUsdcForResource(kind),
        priceLabel: priceLabelForResource(kind),
        url: `${origin}${path}`,
        payCurl: payCurlFor(origin, kind, body),
        defaultBody: body,
      };
    });

  return mcpJsonResponse(cors, {
    ...jsonRpcResult(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              origin,
              mcp: `${origin}/api/mcp`,
              openapi: `${origin}/openapi.json`,
              sdk: "@conc-exe/agent",
              tools: rows,
            },
            null,
            2,
          ),
        },
      ],
      isError: false,
      _meta: { free: true, count: rows.length },
    }),
  });
}

async function handlePreparePayment(
  id: unknown,
  request: Request,
  origin: string,
  cors: Record<string, string>,
  args: { kind?: string },
): Promise<Response> {
  const kind = normalizeKind(String(args.kind ?? ""));
  if (!isPaidMcpKind(kind)) {
    return mcpJsonResponse(cors, jsonRpcError(id, -32602, `Unknown kind: ${args.kind ?? ""}`));
  }

  try {
    const challengeRes = await buildPaymentRequiredResponse(request, kind, cors);
    return formatPaymentChallenge({
      id,
      origin,
      cors,
      kind,
      body: INTEL_TOOL_BODIES[kind] ?? {},
      challengeRes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build payment challenge";
    const body = INTEL_TOOL_BODIES[kind] ?? {};
    const path = pathForKind(kind);
    return mcpJsonResponse(cors, {
      ...jsonRpcResult(id, {
        content: [
          {
            type: "text",
            text: [
              `Could not build live x402 challenge: ${msg}`,
              `Use CLI: ${payCurlFor(origin, kind, body)}`,
              `Or POST ${origin}${path} without payment for a 402 on production.`,
            ].join("\n"),
          },
        ],
        isError: true,
        _meta: {
          paymentRequired: true,
          kind,
          path,
          priceUsdc: priceUsdcForResource(kind),
          payCurl: payCurlFor(origin, kind, body),
          error: msg,
        },
      }),
    });
  }
}

async function proxyPaidTool(input: {
  id: unknown;
  request: Request;
  origin: string;
  cors: Record<string, string>;
  kind: X402ResourceKind;
  args: CallArgs;
}): Promise<Response> {
  const { id, request, origin, cors, kind, args } = input;
  const bodyObj = (args.body ?? INTEL_TOOL_BODIES[kind] ?? {}) as Record<string, unknown>;
  const auth = resolveAuth(request, args);
  const path = pathForKind(kind);
  const bodyJson = JSON.stringify(bodyObj);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(new TextEncoder().encode(bodyJson).length),
    Accept: "application/json",
  };
  if (auth.paymentSignature) headers["PAYMENT-SIGNATURE"] = auth.paymentSignature;
  if (auth.creditsWallet) headers["x-tcx-credits-wallet"] = auth.creditsWallet;
  if (auth.soonHolderWallet) headers["X-Soon-Holder-Wallet"] = auth.soonHolderWallet;
  if (auth.agentId) headers["X-Agent-Id"] = auth.agentId;

  const proxyReq = new Request(`${origin}${path}`, {
    method: "POST",
    headers,
    body: bodyJson,
  });

  let res: Response;
  try {
    res = isIntelResourceKind(kind)
      ? await handleConciergeIntelRoute(proxyReq, kind as X402IntelKind)
      : await handleConciergeSecurityRoute(proxyReq, kind as X402SecurityKind);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Paid route failed";
    return mcpJsonResponse(cors, {
      ...jsonRpcResult(id, {
        content: [
          {
            type: "text",
            text: [
              `Tool error: ${msg}`,
              `Fallback: ${payCurlFor(origin, kind, bodyObj)}`,
            ].join("\n"),
          },
        ],
        isError: true,
        _meta: {
          kind,
          path,
          payCurl: payCurlFor(origin, kind, bodyObj),
          error: msg,
        },
      }),
    });
  }

  if (res.status === 402) {
    return formatPaymentChallenge({
      id,
      origin,
      cors,
      kind,
      body: bodyObj,
      challengeRes: res,
    });
  }

  const text = await res.text();
  return mcpJsonResponse(cors, {
    ...jsonRpcResult(id, {
      content: [{ type: "text", text }],
      isError: res.status >= 400,
      _meta: {
        httpStatus: res.status,
        kind,
        path,
        settledVia: auth.paymentSignature
          ? "paymentSignature"
          : auth.creditsWallet
            ? "creditsWallet"
            : auth.soonHolderWallet
              ? "soonHolderWallet"
              : "unknown",
      },
    }),
  });
}

export default async function handleMcp(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  const origin = siteOrigin(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const body = await withEdgeCache("mcp-discovery", origin, 120_000, async () => {
      const tools = buildTools(origin);
      return {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        protocolVersion: MCP_VERSION,
        transport: "http",
        endpoint: `${origin}/api/mcp`,
        tools: tools.length,
        freeTools: FREE_TOOLS.map((t) => t.name),
        note:
          "POST JSON-RPC 2.0: initialize | tools/list | tools/call. Paid tools proxy x402 — unpaid returns live PAYMENT-REQUIRED. Prefer creditsWallet / soonHolderWallet / paymentSignature, or pay curl. Free: concierge_catalog, concierge_prepare_payment.",
        payShExample: `pay curl ${origin}/api/concierge-intel-macro -d '{}'`,
        sdk: "@conc-exe/agent",
      };
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
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
    return mcpJsonResponse(cors, jsonRpcError(null, -32700, "Parse error"), 400);
  }

  const { id, method, params } = rpc;

  if (method === "initialize") {
    return mcpJsonResponse(cors, {
      ...jsonRpcResult(id, {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Concierge pay-per-call intel. Use concierge_catalog first. Paid tools accept paymentSignature, creditsWallet, or soonHolderWallet. Unpaid calls return live x402 PAYMENT-REQUIRED for settlement.",
      }),
    });
  }

  if (method === "tools/list") {
    return mcpJsonResponse(cors, jsonRpcResult(id, { tools: buildTools(origin) }));
  }

  if (method === "tools/call") {
    const toolName = String(params?.name ?? "");
    const args = (params?.arguments ?? {}) as CallArgs & { prefix?: string; kind?: string };

    if (toolName === "concierge_catalog") {
      return handleCatalog(id, origin, cors, args);
    }
    if (toolName === "concierge_prepare_payment") {
      return handlePreparePayment(id, request, origin, cors, args);
    }

    const kind = normalizeKind(toolName);
    if (!isPaidMcpKind(kind)) {
      return mcpJsonResponse(cors, jsonRpcError(id, -32602, `Unknown tool: ${toolName}`));
    }

    return proxyPaidTool({ id, request, origin, cors, kind, args });
  }

  return mcpJsonResponse(cors, jsonRpcError(id, -32601, "Method not found"));
}
