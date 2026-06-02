/**
 * DeFi desk intelligence for Concierge: TVL, yields (Jupiter/Meteora/DLMM/etc.),
 * whale positioning proxies, optional wallet snapshot, and a structured desk verdict.
 */
import type { PositioningSnap } from "./market-data";
import type { SentimentContext } from "./market-sources";
import type { LoungeMemoryItem } from "./lounge-memory";

const FETCH_MS = 3_200;
const YIELD_MIN_TVL_USD = 75_000;
const YIELD_MAX_APY = 250;

export type YieldPoolRow = {
  project: string;
  symbol: string;
  chain: string;
  apy: string;
  tvlUsd: string;
};

export type ChainTvlRow = {
  name: string;
  tvlUsd: string;
};

export type WalletIntelRow = {
  chain: "solana" | "evm";
  address: string;
  summary: string;
};

export type DeskVerdict = {
  signal: "snipe" | "watch" | "follow" | "avoid" | "rebalance";
  confidence: "low" | "medium" | "high";
  headline: string;
  rationale: string[];
};

export type ConciergeDeFiIntel = {
  fetchedAt: string;
  sources: string[];
  chains: ChainTvlRow[];
  topProtocols: { name: string; tvlUsd: string }[];
  yields: YieldPoolRow[];
  whales: string[];
  wallet?: WalletIntelRow;
  verdict: DeskVerdict;
  insiderLines: string[];
};

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

async function fetchJson<T>(url: string, timeoutMs = FETCH_MS): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json", "User-Agent": "ExecutiveLounge/1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const YIELD_PROJECT_HINTS =
  /jupiter|meteora|dlmm|raydium|orca|kamino|marinade|marginfi|drift|save|lido|aave|uniswap|curve|pendle|morpho|compound/i;

export function wantsDeFiIntel(message: string): boolean {
  const t = message.toLowerCase();
  return /\b(tvl|defi|whale|whales|wallet|pnl|p&l|profit|yield|yields|apy|apr|verdict|meteora|jupiter|dlmm|liquidity|pool|farming|restaking|lst|aave|uniswap|kamino|raydium|orca|drift|marginfi)\b/.test(
    t,
  );
}

export function extractWalletAddresses(message: string): {
  solana?: string;
  evm?: string;
} {
  const evm = message.match(/\b0x[a-fA-F0-9]{40}\b/)?.[0];
  const sol = message.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g)?.find((a) => {
    if (a.length < 32 || a.length > 44) return false;
    if (/^0x/i.test(a)) return false;
    return true;
  });
  return { solana: sol, evm };
}

function heliusApiKey(): string | null {
  const url = process.env.SOLANA_RPC_URL ?? "";
  const m = url.match(/[?&]api-key=([^&]+)/i);
  return m?.[1]?.trim() || null;
}

async function fetchSolanaWalletSummary(address: string): Promise<string | null> {
  const key = heliusApiKey();
  if (!key) return null;
  const data = await fetchJson<{
    nativeBalance?: number;
    tokens?: { mint?: string; amount?: number; decimals?: number; symbol?: string }[];
  }>(`https://api.helius.xyz/v0/addresses/${address}/balances?api-key=${encodeURIComponent(key)}`);
  if (!data) return null;
  const sol = (data.nativeBalance ?? 0) / 1e9;
  const tokens = (data.tokens ?? [])
    .filter((t) => t.symbol && Number(t.amount) > 0)
    .slice(0, 8)
    .map((t) => {
      const dec = t.decimals ?? 0;
      const amt = Number(t.amount) / 10 ** dec;
      return `${t.symbol}: ${amt.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
    });
  return `SOL ${sol.toFixed(4)}${tokens.length ? ` · tokens: ${tokens.join(", ")}` : ""} (Helius snapshot — not full PnL history)`;
}

export async function fetchChainTvl(): Promise<ChainTvlRow[]> {
  const chains = await fetchJson<{ name?: string; tvl?: number }[]>("https://api.llama.fi/v2/chains");
  if (!chains?.length) return [];
  const focus = new Set(["Solana", "Ethereum", "Base", "Arbitrum", "BSC", "Tron"]);
  return chains
    .filter((c) => c.name && focus.has(c.name) && Number.isFinite(c.tvl))
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .map((c) => ({ name: c.name!, tvlUsd: fmtUsd(c.tvl!) }));
}

export async function fetchTopProtocols(): Promise<{ name: string; tvlUsd: string }[]> {
  const protocols = await fetchJson<{ name: string; tvl: number; category?: string }[]>(
    "https://api.llama.fi/protocols",
  );
  if (!protocols?.length) return [];
  const defiCats = /dex|lending|liquid|yield|derivatives|bridge|cdp|farm/i;
  return [...protocols]
    .filter((p) => Number.isFinite(p.tvl) && p.tvl > 0 && defiCats.test(p.category ?? ""))
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 8)
    .map((p) => ({ name: p.name, tvlUsd: fmtUsd(p.tvl) }));
}

export async function fetchTopYields(options?: {
  chain?: string;
  projectHint?: string;
  limit?: number;
}): Promise<YieldPoolRow[]> {
  const pools = await fetchJson<
    {
      chain?: string;
      project?: string;
      symbol?: string;
      tvlUsd?: number;
      apy?: number;
    }[]
  >("https://yields.llama.fi/pools");
  if (!pools?.length) return [];

  const ranked = pools
    .filter((p) => {
      const tvl = p.tvlUsd ?? 0;
      const apy = p.apy ?? 0;
      if (tvl < YIELD_MIN_TVL_USD) return false;
      if (apy <= 0 || apy > YIELD_MAX_APY) return false;
      const chain = (p.chain ?? "").toLowerCase();
      const project = p.project ?? "";
      if (chain === "solana") return YIELD_PROJECT_HINTS.test(project);
      if (chain === "ethereum" || chain === "base" || chain === "arbitrum") {
        return YIELD_PROJECT_HINTS.test(project);
      }
      return false;
    })
    .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));

  const chainFilter = options?.chain?.trim().toLowerCase();
  const projectFilter = options?.projectHint?.trim().toLowerCase();
  const filtered = ranked.filter((p) => {
    if (chainFilter && (p.chain ?? "").toLowerCase() !== chainFilter) return false;
    if (projectFilter && !(p.project ?? "").toLowerCase().includes(projectFilter)) return false;
    return true;
  });

  return filtered.slice(0, options?.limit ?? 12).map((p) => ({
    project: p.project ?? "—",
    symbol: p.symbol ?? "—",
    chain: p.chain ?? "—",
    apy: `${(p.apy ?? 0).toFixed(2)}%`,
    tvlUsd: fmtUsd(p.tvlUsd ?? NaN),
  }));
}

export function buildWhaleLines(positioning: PositioningSnap[]): string[] {
  const lines: string[] = [];
  for (const p of positioning) {
    lines.push(
      `${p.symbol} top-trader positioning: long ${p.topTraderLongPct}, short ${p.topTraderShortPct}, L/S ${p.longShortRatio}, taker ${p.takerBuySellRatio} (Binance — whale desk proxy, not on-chain wallet labels).`,
    );
  }
  if (!lines.length) {
    lines.push(
      "No live derivatives positioning in this fetch — use funding/OI from MULTI-SOURCE block for crowded-trade read.",
    );
  }
  return lines;
}

export function formatInsiderFromMemory(items: LoungeMemoryItem[]): string[] {
  return items
    .filter((i) => i.kind === "creator_signal")
    .slice(0, 6)
    .map((i) => {
      const sum = i.summary ? ` — ${i.summary.slice(0, 200)}${i.summary.length > 200 ? "…" : ""}` : "";
      return `[INSIDER · ${i.category}] ${i.title}${sum}`;
    });
}

function parsePctChange(change: string | undefined): number | null {
  if (!change) return null;
  const n = Number.parseFloat(change.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function buildVerdict(input: {
  btcChange?: string;
  sentiment?: SentimentContext | null;
  positioning: PositioningSnap[];
  yields: YieldPoolRow[];
  insiderLines: string[];
}): DeskVerdict {
  const btc = parsePctChange(input.btcChange);
  const fg = input.sentiment?.index;
  const pos = input.positioning[0];
  const longPct = pos ? Number.parseFloat(pos.topTraderLongPct) : NaN;
  const rationale: string[] = [];

  let score = 0;
  if (fg != null) {
    if (fg >= 75) {
      score -= 1;
      rationale.push(`Fear & Greed ${fg} (${input.sentiment!.label}) — elevated greed / late-cycle risk.`);
    } else if (fg <= 35) {
      score += 1;
      rationale.push(`Fear & Greed ${fg} (${input.sentiment!.label}) — fear regime; selective accumulation setups possible.`);
    } else {
      rationale.push(`Fear & Greed ${fg} (${input.sentiment!.label}) — neutral sentiment band.`);
    }
  }
  if (btc != null) {
    if (btc > 2) {
      score += 1;
      rationale.push(`BTC 24h ${fmtPct(btc)} — risk-on tape supports beta.`);
    } else if (btc < -2) {
      score -= 1;
      rationale.push(`BTC 24h ${fmtPct(btc)} — risk-off; tighten size and favor quality liquidity venues.`);
    }
  }
  if (Number.isFinite(longPct)) {
    if (longPct > 58) {
      score -= 1;
      rationale.push(`BTC top-trader long ${longPct}% — crowded long; liquidation risk on dips.`);
    } else if (longPct < 42) {
      score += 1;
      rationale.push(`BTC top-trader long ${longPct}% — shorts crowded; squeeze risk on strength.`);
    }
  }
  if (input.yields.length) {
    const top = input.yields.slice(0, 3);
    rationale.push(
      `Yield desk: top screened pools — ${top.map((y) => `${y.project} ${y.symbol} ${y.apy} (${y.chain})`).join("; ")}.`,
    );
  }
  if (input.insiderLines.length) {
    rationale.push(`Lounge insider: ${input.insiderLines.length} creator signal(s) in context — weigh against public TVL/yield data.`);
  }

  let signal: DeskVerdict["signal"] = "watch";
  let confidence: DeskVerdict["confidence"] = "medium";
  if (score >= 2) {
    signal = "follow";
    confidence = "high";
  } else if (score <= -2) {
    signal = "avoid";
    confidence = "high";
  } else if (score === 1) {
    signal = "watch";
    confidence = "medium";
  } else if (score === -1) {
    signal = "rebalance";
    confidence = "medium";
  }

  if (input.insiderLines.length >= 2 && score >= 0) {
    signal = score >= 1 ? "snipe" : "watch";
    rationale.push("Multiple creator signals — treat as tactical insider overlay; verify with on-chain liquidity before size.");
  }

  const headline =
    signal === "follow"
      ? "Desk bias: constructive — favor quality DeFi liquidity and confirmed trends."
      : signal === "avoid"
        ? "Desk bias: defensive — reduce chase risk; wait for positioning reset."
        : signal === "snipe"
          ? "Desk bias: tactical — insider + market align; small size, fast invalidation."
          : signal === "rebalance"
            ? "Desk bias: rotate — yields/positioning suggest trim winners, add quality beta."
            : "Desk bias: watch — mixed signals; only engage with clear edge.";

  return { signal, confidence, headline, rationale };
}

export async function fetchWalletIntel(body: {
  message?: string;
  solAddress?: string;
  evmAddress?: string;
}): Promise<WalletIntelRow | null> {
  const fromMsg = extractWalletAddresses(body.message ?? "");
  const sol = (body.solAddress ?? fromMsg.solana)?.trim();
  const evm = (body.evmAddress ?? fromMsg.evm)?.trim();

  if (sol) {
    const summary = await fetchSolanaWalletSummary(sol);
    return {
      chain: "solana",
      address: sol,
      summary:
        summary ??
        "Wallet detected — set SOLANA_RPC_URL to a Helius endpoint with api-key for token snapshot; full PnL requires external indexer.",
    };
  }
  if (evm && /^0x[a-fA-F0-9]{40}$/.test(evm)) {
    return {
      chain: "evm",
      address: evm,
      summary:
        "EVM wallet — use live marks + user cost basis; no public historical PnL API in this deployment.",
    };
  }
  return null;
}

export async function fetchConciergeDeFiIntel(options: {
  message: string;
  positioning?: PositioningSnap[];
  sentiment?: SentimentContext | null;
  btcChange?: string;
  insiderItems?: LoungeMemoryItem[];
  lite?: boolean;
}): Promise<ConciergeDeFiIntel> {
  const wallets = extractWalletAddresses(options.message);
  const insiderLines = formatInsiderFromMemory(options.insiderItems ?? []);

  const [chains, topProtocols, yields, walletRow] = await Promise.all([
    options.lite ? Promise.resolve([] as ChainTvlRow[]) : fetchChainTvl(),
    options.lite ? Promise.resolve([]) : fetchTopProtocols(),
    fetchTopYields(),
    fetchWalletIntel({
      message: options.message,
      solAddress: wallets.solana,
      evmAddress: wallets.evm,
    }),
  ]);

  const positioning = options.positioning ?? [];
  const whales = buildWhaleLines(positioning);
  const verdict = buildVerdict({
    btcChange: options.btcChange,
    sentiment: options.sentiment,
    positioning,
    yields,
    insiderLines,
  });

  const sources = ["DeFi Llama (TVL/yields)", "Binance positioning"];
  if (walletRow?.summary.includes("Helius")) sources.push("Helius balances");
  if (insiderLines.length) sources.push("Lounge creator signals (insider)");

  const wallet = walletRow ?? undefined;

  return {
    fetchedAt: new Date().toISOString(),
    sources,
    chains,
    topProtocols,
    yields,
    whales,
    wallet,
    verdict,
    insiderLines,
  };
}

export function formatDeFiIntelForPrompt(intel: ConciergeDeFiIntel): string {
  const lines: string[] = [
    `DEFI DESK INTELLIGENCE (fetched ${intel.fetchedAt}):`,
    `Sources: ${intel.sources.join(" · ")}`,
    "Rules: Use this block for TVL, yields (Jupiter/Meteora/DLMM/etc.), whale positioning, wallet snapshot, and VERDICT. Cross-check with MULTI-SOURCE MARKET INTELLIGENCE and LOUNGE MEMORY insider lines. Do not invent APY/TVL figures outside this block.",
    "",
    `[DESK VERDICT — ${intel.verdict.confidence} confidence]`,
    `Signal: ${intel.verdict.signal.toUpperCase()} — ${intel.verdict.headline}`,
    ...intel.verdict.rationale.map((r) => `- ${r}`),
  ];

  if (intel.chains.length) {
    lines.push("", "[TVL — chain snapshot (DeFi Llama)]");
    for (const c of intel.chains) lines.push(`- ${c.name}: ${c.tvlUsd}`);
  }
  if (intel.topProtocols.length) {
    lines.push("", "[TVL — top DeFi protocols by category]");
    for (const p of intel.topProtocols) lines.push(`- ${p.name}: ${p.tvlUsd}`);
  }
  if (intel.yields.length) {
    lines.push("", "[YIELDS — screened pools (Jupiter, Meteora, DLMM, lending, major venues)]");
    for (const y of intel.yields) {
      lines.push(`- ${y.project} · ${y.symbol} · ${y.chain} · APY ${y.apy} · TVL ${y.tvlUsd}`);
    }
  }
  lines.push("", "[WHALES — derivatives / desk positioning proxy]");
  for (const w of intel.whales) lines.push(`- ${w}`);
  if (intel.wallet) {
    lines.push("", `[WALLET — ${intel.wallet.chain}]`, `- ${intel.wallet.address}`, `- ${intel.wallet.summary}`);
  }
  if (intel.insiderLines.length) {
    lines.push("", "[INSIDER — Executive Lounge creator signals]");
    for (const i of intel.insiderLines) lines.push(`- ${i}`);
  }

  return lines.join("\n");
}
