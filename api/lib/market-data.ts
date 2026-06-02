import type { MarketTick } from "./concierge-brain";
import {
  fetchBtcNetwork,
  fetchCoinGeckoGlobal,
  fetchDefiLlama,
  fetchFearGreed,
  fetchMarketHeadlines,
  type BtcNetworkContext,
  type DefiContext,
  type GlobalCryptoContext,
  type NewsHeadline,
  type SentimentContext,
} from "./market-sources";

const FETCH_MS = 4_500;
const CONCIERGE_FETCH_MS = 2_800;
/** Tighter timeouts on the trading-plan fast path (fits Vercel 30s incl. x402). */
const CONCIERGE_TRADING_FETCH_MS = 2_000;

export type ConciergeSnapshotMode = "standard" | "trading";

function hasClientTick(ticks: MarketTick[], label: string): boolean {
  const u = label.toUpperCase();
  return ticks.some((t) => (t.symbol ?? "").toUpperCase() === u);
}

function assetHintsFromMessage(message: string): {
  stock: boolean;
  gold: boolean;
  ndx: boolean;
} {
  const t = message.toLowerCase();
  return {
    stock: /\b(nvda|aapl|msft|tsla|amzn|meta|goog|stock|saham|equity|equities)\b/.test(t),
    gold: /\b(gold|xau|emas|gld)\b/.test(t),
    ndx: /\b(ndx|nasdaq|tech index)\b/.test(t),
  };
}

export type DerivativeSnap = {
  symbol: string;
  fundingRate: string;
  openInterest: string;
  markPrice: string;
};

/** Free Binance positioning proxy (replaces paid Coinglass heatmap for Hobby tier) */
export type PositioningSnap = {
  symbol: string;
  topTraderLongPct: string;
  topTraderShortPct: string;
  longShortRatio: string;
  takerBuySellRatio: string;
};

export type LiveMarketSnapshot = {
  fetchedAt: string;
  ticks: MarketTick[];
  derivatives: DerivativeSnap[];
  positioning: PositioningSnap[];
  globalCrypto?: GlobalCryptoContext | null;
  sentiment?: SentimentContext | null;
  defi?: DefiContext | null;
  btcNetwork?: BtcNetworkContext | null;
  headlines: NewsHeadline[];
  sources: string[];
};

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_MS,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        "User-Agent": "ExecutiveLounge/1.0",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fmtUsd(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtFunding(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(4)}%`;
}

const BINANCE_SPOT_MAP: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
  BNBUSDT: "BNB",
  XRPUSDT: "XRP",
  ADAUSDT: "ADA",
  AVAXUSDT: "AVAX",
  LINKUSDT: "LINK",
  DOGEUSDT: "DOGE",
};

const BLUECHIP_STOCKS: { yahoo: string; label: string }[] = [
  { yahoo: "AAPL", label: "AAPL" },
  { yahoo: "MSFT", label: "MSFT" },
  { yahoo: "GOOGL", label: "GOOGL" },
  { yahoo: "NVDA", label: "NVDA" },
  { yahoo: "AMZN", label: "AMZN" },
  { yahoo: "META", label: "META" },
  { yahoo: "TSLA", label: "TSLA" },
  { yahoo: "JPM", label: "JPM" },
];

async function binanceSpot(timeoutMs = FETCH_MS): Promise<MarketTick[]> {
  const symbols = Object.keys(BINANCE_SPOT_MAP);
  const data = await fetchJson<
    { symbol: string; lastPrice: string; priceChangePercent: string }[]
  >(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`,
    undefined,
    timeoutMs,
  );
  if (!data) return [];

  return data
    .filter((r) => BINANCE_SPOT_MAP[r.symbol])
    .map((r) => {
      const label = BINANCE_SPOT_MAP[r.symbol];
      return {
        symbol: label,
        price: fmtUsd(Number(r.lastPrice), label === "BTC" ? 0 : 2),
        change: fmtPct(Number(r.priceChangePercent)),
      };
    });
}

async function binanceFutures(timeoutMs = FETCH_MS): Promise<DerivativeSnap[]> {
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
  const labels: Record<string, string> = {
    BTCUSDT: "BTC",
    ETHUSDT: "ETH",
    SOLUSDT: "SOL",
  };

  const rows = await Promise.all(
    symbols.map(async (sym) => {
      const [prem, oi] = await Promise.all([
        fetchJson<{ lastFundingRate: string; markPrice: string }>(
          `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`,
          undefined,
          timeoutMs,
        ),
        fetchJson<{ openInterest: string }>(
          `https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`,
          undefined,
          timeoutMs,
        ),
      ]);
      if (!prem) return null;
      const mark = Number(prem.markPrice);
      const oiBase = oi ? Number(oi.openInterest) : NaN;
      const oiUsd = Number.isFinite(mark) && Number.isFinite(oiBase) ? mark * oiBase : NaN;
      return {
        symbol: labels[sym],
        fundingRate: fmtFunding(Number(prem.lastFundingRate)),
        openInterest: Number.isFinite(oiUsd) ? fmtUsd(oiUsd, 0) : "—",
        markPrice: fmtUsd(mark, sym === "BTCUSDT" ? 0 : 2),
      };
    }),
  );

  return rows.filter((r): r is DerivativeSnap => r !== null);
}

type RatioRow = {
  longAccount?: string;
  shortAccount?: string;
  longShortRatio?: string;
  buySellRatio?: string;
};

async function binancePositioning(
  symbol: string,
  label: string,
  timeoutMs = FETCH_MS,
): Promise<PositioningSnap | null> {
  const period = "1h";
  const limit = 1;
  const base = "https://fapi.binance.com/futures/data";

  const [accounts, positions, taker] = await Promise.all([
    fetchJson<RatioRow[]>(
      `${base}/topLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`,
      undefined,
      timeoutMs,
    ),
    fetchJson<RatioRow[]>(
      `${base}/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=${limit}`,
      undefined,
      timeoutMs,
    ),
    fetchJson<RatioRow[]>(
      `${base}/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=${limit}`,
      undefined,
      timeoutMs,
    ),
  ]);

  const acc = accounts?.[0];
  const pos = positions?.[0];
  const tak = taker?.[0];
  if (!acc && !pos && !tak) return null;

  const longPct = Number(acc?.longAccount ?? pos?.longAccount);
  const shortPct = Number(acc?.shortAccount ?? pos?.shortAccount);
  const lsRatio = Number(acc?.longShortRatio ?? pos?.longShortRatio);
  const takerRatio = Number(tak?.buySellRatio ?? tak?.longShortRatio);

  return {
    symbol: label,
    topTraderLongPct: Number.isFinite(longPct) ? `${longPct.toFixed(1)}%` : "—",
    topTraderShortPct: Number.isFinite(shortPct) ? `${shortPct.toFixed(1)}%` : "—",
    longShortRatio: Number.isFinite(lsRatio) ? lsRatio.toFixed(2) : "—",
    takerBuySellRatio: Number.isFinite(takerRatio) ? takerRatio.toFixed(2) : "—",
  };
}

async function binancePositioningAll(): Promise<PositioningSnap[]> {
  return fetchBinanceTopTraderPositioning(["BTC", "ETH", "SOL"]);
}

const BINANCE_SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

/** Public export for Concierge intel API (whale positioning). */
export async function fetchBinanceTopTraderPositioning(
  labels: ("BTC" | "ETH" | "SOL")[] = ["BTC", "ETH", "SOL"],
  timeoutMs = FETCH_MS,
): Promise<PositioningSnap[]> {
  const rows = await Promise.all(
    labels.map((label) => {
      const sym = BINANCE_SYMBOL_MAP[label];
      return sym ? binancePositioning(sym, label, timeoutMs) : Promise.resolve(null);
    }),
  );
  return rows.filter((r): r is PositioningSnap => r !== null);
}

async function yahooQuote(
  yahooSymbol: string,
  label: string,
  timeoutMs = FETCH_MS,
): Promise<MarketTick | null> {
  const data = await fetchJson<{
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
      }[];
    };
  }>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`,
    undefined,
    timeoutMs,
  );

  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prev = meta?.chartPreviousClose;
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;

  const chg = ((price! - prev!) / prev!) * 100;
  const fxLabels = new Set(["DXY", "VIX"]);
  const indexLabels = new Set(["SPX", "NDX"]);
  const stockLabels = new Set(BLUECHIP_STOCKS.map((s) => s.label));
  let priceDisplay: string;
  if (fxLabels.has(label)) priceDisplay = price!.toFixed(2);
  else if (indexLabels.has(label)) priceDisplay = fmtUsd(price!, 0);
  else if (stockLabels.has(label) || label === "GOLD" || label === "OIL")
    priceDisplay = fmtUsd(price!, 2);
  else priceDisplay = fmtUsd(price!, 0);

  return {
    symbol: label,
    price: priceDisplay,
    change: fmtPct(chg),
  };
}

/** Concierge market snapshot — `trading` mode minimizes fetches to avoid Vercel timeout. */
export async function fetchConciergeMarketSnapshot(options?: {
  mode?: ConciergeSnapshotMode;
  clientTicks?: MarketTick[];
  message?: string;
}): Promise<LiveMarketSnapshot> {
  const mode = options?.mode ?? "standard";
  const client = options?.clientTicks ?? [];
  const hints = assetHintsFromMessage(options?.message ?? "");

  if (mode === "trading") {
    const ms = CONCIERGE_TRADING_FETCH_MS;
    const yahooTasks: Promise<MarketTick | null>[] = [];
    if (!hasClientTick(client, "SPX")) yahooTasks.push(yahooQuote("^GSPC", "SPX", ms));
    if (!hasClientTick(client, "DXY")) yahooTasks.push(yahooQuote("DX-Y.NYB", "DXY", ms));
    if (!hasClientTick(client, "VIX")) yahooTasks.push(yahooQuote("^VIX", "VIX", ms));
    if (hints.ndx && !hasClientTick(client, "NDX")) {
      yahooTasks.push(yahooQuote("^IXIC", "NDX", ms));
    }
    if (hints.gold && !hasClientTick(client, "GOLD")) {
      yahooTasks.push(yahooQuote("GC=F", "GOLD", ms));
    }
    if (hints.stock) {
      if (!hasClientTick(client, "NVDA")) yahooTasks.push(yahooQuote("NVDA", "NVDA", ms));
      if (!hasClientTick(client, "AAPL")) yahooTasks.push(yahooQuote("AAPL", "AAPL", ms));
    }

    const [spot, derivs, btcPositioning, sentiment, headlines, ...yahooExtra] = await Promise.all([
      binanceSpot(ms),
      binanceFutures(ms),
      binancePositioning("BTCUSDT", "BTC", ms),
      fetchFearGreed(),
      fetchMarketHeadlines(2),
      ...yahooTasks,
    ]);

    const ticks: MarketTick[] = [];
    const seen = new Set<string>();
    for (const t of [...client, ...spot, ...yahooExtra]) {
      if (!t?.symbol) continue;
      const sym = t.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      seen.add(sym);
      ticks.push(t);
    }

    const sources: string[] = [];
    if (spot.length || client.length) sources.push("Binance / terminal tape");
    if (derivs.length) sources.push("Binance futures");
    if (btcPositioning) sources.push("Binance positioning");
    if (yahooExtra.some(Boolean)) sources.push("Yahoo Finance");
    if (sentiment) sources.push("Alternative.me Fear & Greed");
    if (headlines.length) {
      const pubs = [...new Set(headlines.map((h) => h.source))];
      sources.push(`Headlines (${pubs.join(", ")})`);
    }

    return {
      fetchedAt: new Date().toISOString(),
      ticks,
      derivatives: derivs,
      positioning: btcPositioning ? [btcPositioning] : [],
      sentiment,
      headlines,
      sources,
    };
  }

  const ms = CONCIERGE_FETCH_MS;
  const [spot, derivs, btcPositioning, spx, dxy, vix, globalCrypto, sentiment, headlines] =
    await Promise.all([
      binanceSpot(ms),
      binanceFutures(ms),
      binancePositioning("BTCUSDT", "BTC", ms),
      yahooQuote("^GSPC", "SPX", ms),
      yahooQuote("DX-Y.NYB", "DXY", ms),
      yahooQuote("^VIX", "VIX", ms),
      fetchCoinGeckoGlobal(),
      fetchFearGreed(),
      fetchMarketHeadlines(2),
    ]);

  const ticks: MarketTick[] = [...spot];
  for (const t of [spx, dxy, vix]) {
    if (t) ticks.push(t);
  }

  const sources: string[] = [];
  if (spot.length) sources.push("Binance");
  if (derivs.length) sources.push("Binance futures");
  if (btcPositioning) sources.push("Binance positioning");
  if (spx || dxy || vix) sources.push("Yahoo Finance");
  if (globalCrypto) sources.push("CoinGecko");
  if (sentiment) sources.push("Alternative.me Fear & Greed");
  if (headlines.length) {
    const pubs = [...new Set(headlines.map((h) => h.source))];
    sources.push(`Headlines (${pubs.join(", ")})`);
  }

  return {
    fetchedAt: new Date().toISOString(),
    ticks,
    derivatives: derivs,
    positioning: btcPositioning ? [btcPositioning] : [],
    globalCrypto,
    sentiment,
    headlines,
    sources,
  };
}

/** Multi-source live intelligence — exchange, macro, DeFi, sentiment, institutional headlines */
export async function fetchLiveMarketSnapshot(): Promise<LiveMarketSnapshot> {
  const [
    spot,
    derivs,
    positioning,
    spx,
    dxy,
    vix,
    ndx,
    gold,
    oil,
    stockTicks,
    globalCrypto,
    sentiment,
    defi,
    btcNetwork,
    headlines,
  ] = await Promise.all([
    binanceSpot(),
    binanceFutures(),
    binancePositioningAll(),
    yahooQuote("^GSPC", "SPX"),
    yahooQuote("DX-Y.NYB", "DXY"),
    yahooQuote("^VIX", "VIX"),
    yahooQuote("^IXIC", "NDX"),
    yahooQuote("GC=F", "GOLD"),
    yahooQuote("CL=F", "OIL"),
    Promise.all(BLUECHIP_STOCKS.map((s) => yahooQuote(s.yahoo, s.label))),
    fetchCoinGeckoGlobal(),
    fetchFearGreed(),
    fetchDefiLlama(),
    fetchBtcNetwork(),
    fetchMarketHeadlines(2),
  ]);

  const ticks: MarketTick[] = [...spot];
  for (const t of [spx, dxy, vix, ndx, gold, oil]) {
    if (t) ticks.push(t);
  }
  for (const t of stockTicks) {
    if (t) ticks.push(t);
  }

  const sources: string[] = [];
  if (spot.length) sources.push("Binance");
  if (derivs.length) sources.push("Binance futures");
  if (positioning.length) sources.push("Binance positioning");
  if (spx || dxy || vix || ndx || gold || oil || stockTicks.some(Boolean))
    sources.push("Yahoo Finance");
  if (globalCrypto) sources.push("CoinGecko");
  if (sentiment) sources.push("Alternative.me Fear & Greed");
  if (defi) sources.push("DeFi Llama");
  if (btcNetwork) sources.push("Mempool.space");
  if (headlines.length) {
    const pubs = [...new Set(headlines.map((h) => h.source))];
    sources.push(`Headlines (${pubs.join(", ")})`);
  }

  return {
    fetchedAt: new Date().toISOString(),
    ticks,
    derivatives: derivs,
    positioning,
    globalCrypto,
    sentiment,
    defi,
    btcNetwork,
    headlines,
    sources,
  };
}

export function formatLiveMarketForPrompt(snapshot: LiveMarketSnapshot): string {
  const lines: string[] = [
    `MULTI-SOURCE MARKET INTELLIGENCE (fetched ${snapshot.fetchedAt}):`,
    `Sources: ${snapshot.sources.join(" · ")}`,
    "Rules: Quote numbers from this block. Attribute headlines by publisher (CoinDesk, Bloomberg, Reuters, etc.). Bloomberg/Reuters here = public RSS headlines, not Bloomberg Terminal. Cross-check crypto spot with Binance; macro with Yahoo.",
  ];

  lines.push("\n[PRICES & INDICES]");
  for (const t of snapshot.ticks) {
    lines.push(`- ${t.symbol}: ${t.price} (${t.change} 24h)`);
  }

  if (snapshot.globalCrypto) {
    const g = snapshot.globalCrypto;
    lines.push(
      "\n[CRYPTO MARKET — CoinGecko]",
      `- Total market cap: ${g.totalMarketCapUsd} (${g.marketCapChange24h} 24h)`,
      `- 24h volume: ${g.volume24hUsd} | BTC dominance: ${g.btcDominance}`,
    );
  }

  if (snapshot.sentiment) {
    lines.push(
      "\n[SENTIMENT — Crypto Fear & Greed]",
      `- Index: ${snapshot.sentiment.index}/100 (${snapshot.sentiment.label})`,
    );
  }

  if (snapshot.defi) {
    lines.push("\n[DEFI — DeFi Llama]", `- Total TVL: ${snapshot.defi.totalTvlUsd}`);
    for (const p of snapshot.defi.topProtocols) {
      lines.push(`- ${p.name}: TVL ${p.tvlUsd}`);
    }
  }

  if (snapshot.btcNetwork) {
    lines.push(
      "\n[BTC NETWORK — Mempool.space]",
      `- Recommended fees: fast ${snapshot.btcNetwork.fastFeeSatVb}, ~1h ${snapshot.btcNetwork.hourFeeSatVb}`,
    );
  }

  if (snapshot.derivatives.length) {
    lines.push("\n[DERIVATIVES — Binance perps]");
    for (const d of snapshot.derivatives) {
      lines.push(
        `- ${d.symbol}: mark ${d.markPrice}, funding ${d.fundingRate}, OI ≈ ${d.openInterest}`,
      );
    }
  }

  if (snapshot.positioning.length) {
    lines.push("\n[POSITIONING — Binance top traders, 1h]");
    for (const p of snapshot.positioning) {
      lines.push(
        `- ${p.symbol}: long ${p.topTraderLongPct}, short ${p.topTraderShortPct}, L/S ${p.longShortRatio}, taker ${p.takerBuySellRatio}`,
      );
    }
    lines.push(
      "- Liq framework: funding + OI + L/S + taker → approximate liq zones as % from mark (not Coinglass).",
    );
  }

  if (snapshot.headlines.length) {
    lines.push("\n[LATEST HEADLINES — narrative context]");
    for (const h of snapshot.headlines) {
      const when = h.published ? ` (${h.published})` : "";
      lines.push(`- [${h.source}]${when}: ${h.title}`);
    }
  }

  return lines.join("\n");
}

const TICKER_UI_ORDER = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "AVAX",
  "LINK",
  "DOGE",
  "SPX",
  "NDX",
  "DXY",
  "VIX",
  "GOLD",
  "OIL",
  "AAPL",
  "MSFT",
  "GOOGL",
  "NVDA",
  "AMZN",
  "META",
  "TSLA",
  "JPM",
] as const;

export function ticksForUi(snapshot: LiveMarketSnapshot): MarketTick[] {
  const bySym = new Map(snapshot.ticks.map((t) => [t.symbol, t]));
  const ordered = TICKER_UI_ORDER.map((s) => bySym.get(s)).filter(
    (t): t is MarketTick => t !== undefined,
  );
  const seen = new Set(TICKER_UI_ORDER);
  const rest = snapshot.ticks.filter((t) => !seen.has(t.symbol as (typeof TICKER_UI_ORDER)[number]));
  return [...ordered, ...rest];
}
