/**
 * Shared x402 handlers for Concierge DeFi intelligence endpoints (integrators).
 */
import { runAlphaIntel } from "./concierge-alpha-intel";
import { runDeskBriefIntel } from "./concierge-desk-brief";
import { runMeteoraIntel } from "./concierge-meteora-intel";
import { runMacroIntel, runWireIntel } from "./concierge-research-intel";
import { runScalpIntel } from "./concierge-scalp-intel";
import {
  buildVerdict,
  fetchChainTvl,
  fetchTopProtocols,
  fetchTopYields,
  fetchWalletIntel,
  formatInsiderFromMemory,
  type DeskVerdict,
  type WalletIntelRow,
  type YieldPoolRow,
} from "./concierge-defi-intel";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import {
  fetchBinanceTopTraderPositioning,
  fetchConciergeMarketSnapshot,
} from "./market-data";
import { fetchFearGreed } from "./market-sources";
import { selectRelevantLoungeMemory } from "./lounge-memory";
import { reportPaidRouteToZauth } from "./zauth-paid-response";
import { guardPaidX402Api } from "./x402-server";
import type { X402IntelKind } from "./x402-pricing";
import { recordVerdictSnapshot } from "./verdict-accuracy";

export type { X402IntelKind };

export const INTEL_ROUTE_PATH: Record<X402IntelKind, string> = {
  "intel-tvl": "/api/concierge-intel-tvl",
  "intel-yields": "/api/concierge-intel-yields",
  "intel-whales": "/api/concierge-intel-whales",
  "intel-wallet": "/api/concierge-intel-wallet",
  "intel-verdict": "/api/concierge-intel-verdict",
  "intel-airdrop": "/api/concierge-intel-airdrop",
  "intel-listing": "/api/concierge-intel-listing",
  "intel-momentum": "/api/concierge-intel-momentum",
  "intel-scalp": "/api/concierge-intel-scalp",
  "intel-macro": "/api/concierge-intel-macro",
  "intel-wire": "/api/concierge-intel-wire",
  "intel-meteora": "/api/concierge-intel-meteora",
  "intel-desk-brief": "/api/concierge-intel-desk-brief",
};

const INTEL_KINDS = Object.keys(INTEL_ROUTE_PATH) as X402IntelKind[];

/** Resolve intel kind from unified /api/concierge-intel or legacy /api/concierge-intel-* paths. */
export function resolveIntelKindFromRequest(request: Request): X402IntelKind | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("kind");
  if (fromQuery && INTEL_KINDS.includes(fromQuery as X402IntelKind)) {
    return fromQuery as X402IntelKind;
  }
  const match = url.pathname.match(/^\/api\/concierge-intel-([a-z][a-z0-9-]*)$/);
  if (!match) return null;
  const kind = `intel-${match[1]}` as X402IntelKind;
  return INTEL_KINDS.includes(kind) ? kind : null;
}

export type IntelRequestBody = {
  message?: string;
  solAddress?: string;
  evmAddress?: string;
  /** Whales: BTC | ETH | SOL (default all three) */
  symbols?: string[];
  /** Yields: solana | ethereum | base | arbitrum */
  chain?: string;
  /** Yields: substring match on project id (e.g. meteora, jupiter) */
  project?: string;
  /** Verdict: include Lounge creator signals as insider overlay */
  includeInsider?: boolean;
  /** Alpha desks: max candidates (1–8, default 5) */
  limit?: number;
  /** Wire desk: category filter (Macro, Geopolitics, Crypto, …) */
  category?: string;
  /** Scalp desk: 5m | 15m (default both) */
  intervals?: ("5m" | "15m")[];
  /** Meteora: sortByApy, poolHint */
  sortByApy?: boolean;
  poolHint?: string;
};

function jsonResponse(
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

function parseSymbols(raw: unknown): ("BTC" | "ETH" | "SOL")[] {
  if (!Array.isArray(raw) || !raw.length) return ["BTC", "ETH", "SOL"];
  const allowed = new Set(["BTC", "ETH", "SOL"]);
  const out = raw
    .map((s) => String(s).trim().toUpperCase())
    .filter((s): s is "BTC" | "ETH" | "SOL" => allowed.has(s));
  return out.length ? out : ["BTC", "ETH", "SOL"];
}

export function validateIntelRequest(raw: unknown): IntelRequestBody {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid JSON body");
  }
  return raw as IntelRequestBody;
}

async function runIntel(
  kind: X402IntelKind,
  body: IntelRequestBody,
): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const message = String(body.message ?? "").trim();

  if (kind === "intel-tvl") {
    const [chains, topProtocols] = await Promise.all([fetchChainTvl(), fetchTopProtocols()]);
    return {
      ok: true,
      kind,
      dataAsOf: fetchedAt,
      sources: ["DeFi Llama"],
      chains,
      topProtocols,
    };
  }

  if (kind === "intel-yields") {
    const pools: YieldPoolRow[] = await fetchTopYields({
      chain: body.chain,
      projectHint: body.project,
      limit: 16,
    });
    return {
      ok: true,
      kind,
      dataAsOf: fetchedAt,
      sources: ["DeFi Llama yields"],
      filters: { chain: body.chain ?? null, project: body.project ?? null },
      pools,
    };
  }

  if (kind === "intel-whales") {
    const symbols = parseSymbols(body.symbols);
    const positioning = await fetchBinanceTopTraderPositioning(symbols);
    return {
      ok: true,
      kind,
      dataAsOf: fetchedAt,
      sources: ["Binance futures (top trader ratios)"],
      note: "Derivatives desk proxy — not labeled on-chain whale wallets.",
      symbols,
      positioning,
    };
  }

  if (kind === "intel-wallet") {
    const wallet: WalletIntelRow | null = await fetchWalletIntel({
      message,
      solAddress: body.solAddress,
      evmAddress: body.evmAddress,
    });
    if (!wallet) {
      throw new Error(
        "Wallet required: provide solAddress, evmAddress (0x…), or paste an address in message",
      );
    }
    return {
      ok: true,
      kind,
      dataAsOf: fetchedAt,
      sources: wallet.summary.includes("Helius") ? ["Helius"] : [],
      wallet,
      pnlNote:
        "Historical PnL is not computed server-side. Use marks + cost basis off-chain or a dedicated indexer.",
    };
  }

  if (kind === "intel-verdict") {
    const includeInsider = body.includeInsider !== false;
    const [snapshot, sentiment, yields, memoryItems] = await Promise.all([
      fetchConciergeMarketSnapshot({ mode: "trading", message }),
      fetchFearGreed(),
      fetchTopYields({ limit: 8 }),
      includeInsider && message
        ? selectRelevantLoungeMemory(message, 10)
        : Promise.resolve([]),
    ]);
    const insiderLines = formatInsiderFromMemory(memoryItems);
    const btcTick = snapshot.ticks.find((t) => t.symbol.toUpperCase() === "BTC");
    const verdict: DeskVerdict = buildVerdict({
      btcChange: btcTick?.change,
      sentiment,
      positioning: snapshot.positioning,
      yields,
      insiderLines,
    });
    const btcUsd = btcTick?.price ? Number(String(btcTick.price).replace(/[^0-9.]/g, "")) : null;
    void recordVerdictSnapshot({ verdict, btcUsd: Number.isFinite(btcUsd) ? btcUsd : null });
    return {
      ok: true,
      kind,
      dataAsOf: fetchedAt,
      sources: [
        "DeFi Llama yields",
        "Binance positioning",
        "Alternative.me Fear & Greed",
        ...(insiderLines.length ? ["Lounge creator signals"] : []),
      ],
      context: message || null,
      verdict,
      insider: insiderLines.map((line) => ({ line })),
      supporting: {
        fearGreed: sentiment,
        btcChange24h: btcTick?.change ?? null,
        topYields: yields.slice(0, 5),
        positioning: snapshot.positioning,
      },
    };
  }

  if (kind === "intel-airdrop" || kind === "intel-listing" || kind === "intel-momentum") {
    return runAlphaIntel(kind, body);
  }

  if (kind === "intel-scalp") {
    return runScalpIntel(body);
  }

  if (kind === "intel-macro") {
    return runMacroIntel();
  }

  if (kind === "intel-wire") {
    return runWireIntel(body);
  }

  if (kind === "intel-meteora") {
    return runMeteoraIntel({
      sortByApy: body.sortByApy,
      limit: body.limit,
      poolHint: body.poolHint,
    });
  }

  if (kind === "intel-desk-brief") {
    return runDeskBriefIntel(body);
  }

  throw new Error("Unknown intel kind");
}

export async function handleConciergeIntelRoute(
  request: Request,
  kind: X402IntelKind,
): Promise<Response> {
  const routed = await guardPaidX402Api(request, kind);
  if ("response" in routed) return routed.response;
  const { gate: payGate } = routed.continue;

  const startedAt = Date.now();

  try {
    assertAllowedOrigin(request);

    const raw = await readBodyWithLimit(request);
    const body = validateIntelRequest(raw);
    const payload = await runIntel(kind, body);

    const extraHeaders: Record<string, string> = {};
    if (payGate.paymentResponseHeader) {
      extraHeaders["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
    }

    reportPaidRouteToZauth(request, kind, 200, payload, startedAt, {
      payer: payGate.payer,
      transaction: payGate.transaction,
      paymentResponseHeader: payGate.paymentResponseHeader,
    });

    return jsonResponse(request, payload, 200, extraHeaders);
  } catch (e) {
    const msg = sanitizePublicError(e);
    const status = msg.includes("too large")
      ? 413
      : msg.includes("Wallet required") || msg.includes("Invalid JSON")
        ? 400
        : 500;
    return jsonResponse(request, { error: msg, kind }, status);
  }
}
