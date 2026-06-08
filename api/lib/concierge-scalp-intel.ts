/**
 * Scalping desk — BTC/ETH/BNB/SOL USDT on 5m & 15m (Binance spot klines + perp overlay).
 */
import { fetchBinanceTopTraderPositioning, type DerivativeSnap, type PositioningSnap } from "./market-data";

export const SCALP_SYMBOLS = ["BTC", "ETH", "BNB", "SOL"] as const;
export type ScalpSymbol = (typeof SCALP_SYMBOLS)[number];
export type ScalpInterval = "5m" | "15m";

export type ScalpIntelRequestBody = {
  message?: string;
  symbols?: string[];
  intervals?: ScalpInterval[];
};

const SCALP_PAIR_MAP: Record<ScalpSymbol, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  BNB: "BNBUSDT",
  SOL: "SOLUSDT",
};

const FETCH_MS = 3_500;
const KLINE_LIMIT = 60;

export type KlineRow = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TaSummary = {
  rsi14: number;
  ema9: number;
  ema21: number;
  trend: "bullish" | "bearish" | "neutral";
  recentHigh: number;
  recentLow: number;
  lastClose: number;
  changePct: number;
};

export type ScalpIntervalIntel = {
  interval: ScalpInterval;
  ta: TaSummary;
  candleCount: number;
};

export type ScalpAssetIntel = {
  symbol: ScalpSymbol;
  pair: string;
  intervals: ScalpIntervalIntel[];
  markPrice?: string;
  fundingRate?: string;
  openInterest?: string;
  positioning?: PositioningSnap | null;
};

export type ScalpDeskSnapshot = {
  fetchedAt: string;
  symbols: ScalpSymbol[];
  intervals: ScalpInterval[];
  assets: ScalpAssetIntel[];
  sources: string[];
};

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

function fmtUsd(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function fmtFunding(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(4)}%`;
}

function computeEma(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeTaSummary(klines: KlineRow[]): TaSummary {
  const closes = klines.map((k) => k.close);
  const last = closes[closes.length - 1] ?? 0;
  const prev = closes[closes.length - 2] ?? last;
  const window = klines.slice(-20);
  const recentHigh = Math.max(...window.map((k) => k.high), last);
  const recentLow = Math.min(...window.map((k) => k.low), last);
  const ema9 = computeEma(closes, 9);
  const ema21 = computeEma(closes, 21);
  const rsi14 = computeRsi(closes, 14);
  let trend: TaSummary["trend"] = "neutral";
  if (ema9 > ema21 * 1.0003 && last >= ema9) trend = "bullish";
  else if (ema9 < ema21 * 0.9997 && last <= ema9) trend = "bearish";

  return {
    rsi14: Number(rsi14.toFixed(1)),
    ema9: Number(ema9.toFixed(8)),
    ema21: Number(ema21.toFixed(8)),
    trend,
    recentHigh,
    recentLow,
    lastClose: last,
    changePct: prev ? Number((((last - prev) / prev) * 100).toFixed(3)) : 0,
  };
}

export async function fetchBinanceKlines(
  pair: string,
  interval: ScalpInterval,
  limit = KLINE_LIMIT,
  timeoutMs = FETCH_MS,
): Promise<KlineRow[]> {
  const raw = await fetchJson<
    [number, string, string, string, string, string, ...unknown[]][]
  >(
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
    timeoutMs,
  );
  if (!raw?.length) return [];
  return raw.map((row) => ({
    openTime: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
}

async function fetchPerpSnap(symbol: ScalpSymbol): Promise<Partial<DerivativeSnap> | null> {
  const pair = SCALP_PAIR_MAP[symbol];
  const [prem, oi] = await Promise.all([
    fetchJson<{ lastFundingRate: string; markPrice: string }>(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`,
    ),
    fetchJson<{ openInterest: string }>(
      `https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair}`,
    ),
  ]);
  if (!prem) return null;
  const mark = Number(prem.markPrice);
  const oiBase = oi ? Number(oi.openInterest) : NaN;
  const oiUsd = Number.isFinite(mark) && Number.isFinite(oiBase) ? mark * oiBase : NaN;
  const decimals = symbol === "BTC" ? 0 : 2;
  return {
    symbol,
    markPrice: fmtUsd(mark, decimals),
    fundingRate: fmtFunding(Number(prem.lastFundingRate)),
    openInterest: Number.isFinite(oiUsd) ? fmtUsd(oiUsd, 0) : "—",
  };
}

export function parseScalpSymbols(raw: unknown, message = ""): ScalpSymbol[] {
  const allowed = new Set<string>(SCALP_SYMBOLS);
  if (Array.isArray(raw) && raw.length) {
    const out = raw
      .map((s) => String(s).trim().toUpperCase())
      .filter((s): s is ScalpSymbol => allowed.has(s));
    if (out.length) return [...new Set(out)];
  }
  const t = message.toLowerCase();
  const hits: ScalpSymbol[] = [];
  if (/\b(btc|bitcoin)\b/.test(t)) hits.push("BTC");
  if (/\b(eth|ethereum)\b/.test(t)) hits.push("ETH");
  if (/\b(bnb|binance\s*coin)\b/.test(t)) hits.push("BNB");
  if (/\b(sol|solana)\b/.test(t)) hits.push("SOL");
  return hits.length ? hits : [...SCALP_SYMBOLS];
}

export function parseScalpIntervals(raw: unknown, message = ""): ScalpInterval[] {
  const allowed = new Set<ScalpInterval>(["5m", "15m"]);
  if (Array.isArray(raw) && raw.length) {
    const out = raw
      .map((s) => String(s).trim() as ScalpInterval)
      .filter((s): s is ScalpInterval => allowed.has(s));
    if (out.length) return [...new Set(out)];
  }
  const t = message.toLowerCase();
  const hits: ScalpInterval[] = [];
  if (/\b(5m|5\s*min|five[\s-]?minute)\b/.test(t)) hits.push("5m");
  if (/\b(15m|15\s*min|fifteen[\s-]?minute)\b/.test(t)) hits.push("15m");
  return hits.length ? hits : ["5m", "15m"];
}

export function messageRequestsScalpDesk(message: string): boolean {
  const t = message.toLowerCase();
  const tf = /\b(5m|5\s*min|15m|15\s*min|five[\s-]?minute|fifteen[\s-]?minute)\b/i.test(message);
  const scalp = /\b(scalp|scalping|intraday scalp)\b/i.test(t);
  const asset = /\b(btc|eth|bnb|sol|bitcoin|ethereum|solana|binance\s*coin)\b/i.test(t);
  if (scalp && (asset || /\b(usdt|crypto|coin|pair)\b/i.test(t))) return true;
  if (tf && asset) return true;
  return false;
}

export async function fetchScalpDeskIntel(options: {
  symbols?: ScalpSymbol[];
  intervals?: ScalpInterval[];
  message?: string;
}): Promise<ScalpDeskSnapshot> {
  const message = String(options.message ?? "").trim();
  const symbols = options.symbols ?? parseScalpSymbols(undefined, message);
  const intervals = options.intervals ?? parseScalpIntervals(undefined, message);
  const fetchedAt = new Date().toISOString();

  const perpLabels = symbols.filter((s): s is "BTC" | "ETH" | "SOL" =>
    (["BTC", "ETH", "SOL"] as const).includes(s as "BTC" | "ETH" | "SOL"),
  );
  const positioning = await fetchBinanceTopTraderPositioning(
    perpLabels.length ? perpLabels : ["BTC", "ETH", "SOL"],
  );
  const assetRows = await Promise.all(
    symbols.map(async (symbol): Promise<ScalpAssetIntel> => {
      const pair = SCALP_PAIR_MAP[symbol];
      const intervalRows = await Promise.all(
        intervals.map(async (interval) => {
          const klines = await fetchBinanceKlines(pair, interval);
          return {
            interval,
            ta: computeTaSummary(klines),
            candleCount: klines.length,
          };
        }),
      );
      const perp = await fetchPerpSnap(symbol);
      const pos = positioning.find((p) => p.symbol === symbol) ?? null;
      return {
        symbol,
        pair,
        intervals: intervalRows,
        markPrice: perp?.markPrice,
        fundingRate: perp?.fundingRate,
        openInterest: perp?.openInterest,
        positioning: pos,
      };
    }),
  );

  return {
    fetchedAt,
    symbols,
    intervals,
    assets: assetRows,
    sources: ["Binance spot klines (5m/15m)", "Binance USDT-M perps (mark, funding, OI, positioning)"],
  };
}

function priceDecimals(symbol: ScalpSymbol): number {
  return symbol === "BTC" ? 0 : symbol === "ETH" ? 1 : 2;
}

export function formatScalpIntelForPrompt(snapshot: ScalpDeskSnapshot): string {
  const lines: string[] = [
    `SCALP DESK INTELLIGENCE (fetched ${snapshot.fetchedAt}):`,
    `Pairs: ${snapshot.symbols.map((s) => `${s}/USDT`).join(", ")} · Timeframes: ${snapshot.intervals.join(", ")}`,
    `Sources: ${snapshot.sources.join(" · ")}`,
    "Rules: Anchor scalp entries/stops/TPs to lastClose, recentHigh/recentLow, EMA9/EMA21, and RSI14 from this block — not invented levels.",
  ];

  for (const asset of snapshot.assets) {
    lines.push(`\n[${asset.symbol}/USDT]`);
    if (asset.markPrice) {
      lines.push(
        `- Perp mark ${asset.markPrice}${asset.fundingRate ? ` · funding ${asset.fundingRate}` : ""}${asset.openInterest ? ` · OI ≈ ${asset.openInterest}` : ""}`,
      );
    }
    if (asset.positioning) {
      const p = asset.positioning;
      lines.push(
        `- Positioning (1h): long ${p.topTraderLongPct} · short ${p.topTraderShortPct} · L/S ${p.longShortRatio} · taker ${p.takerBuySellRatio}`,
      );
    }
    for (const row of asset.intervals) {
      const d = priceDecimals(asset.symbol);
      const ta = row.ta;
      lines.push(
        `- ${row.interval}: close ${fmtUsd(ta.lastClose, d)} (${ta.changePct >= 0 ? "+" : ""}${ta.changePct}% vs prior bar) · RSI14 ${ta.rsi14} · EMA9 ${fmtUsd(ta.ema9, d)} · EMA21 ${fmtUsd(ta.ema21, d)} · trend ${ta.trend}`,
      );
      lines.push(
        `  · Range (last 20 bars): H ${fmtUsd(ta.recentHigh, d)} · L ${fmtUsd(ta.recentLow, d)}`,
      );
    }
  }

  return lines.join("\n");
}

export async function runScalpIntel(body: ScalpIntelRequestBody): Promise<Record<string, unknown>> {
  const message = String(body.message ?? "").trim();
  const symbols = parseScalpSymbols(body.symbols, message);
  const intervals = parseScalpIntervals(body.intervals, message);
  const desk = await fetchScalpDeskIntel({ symbols, intervals, message });
  return {
    ok: true,
    kind: "intel-scalp",
    dataAsOf: desk.fetchedAt,
    sources: desk.sources,
    context: message || null,
    filters: { symbols, intervals, pairs: symbols.map((s) => `${s}/USDT`) },
    methodology: {
      timeframes: ["5m", "15m"],
      assets: [...SCALP_SYMBOLS],
      indicators: ["RSI14", "EMA9", "EMA21", "recent 20-bar high/low"],
      disclaimer:
        "Scalp levels are derived from live Binance klines and perp overlays — not financial advice. Trading carries significant risk. DYOR.",
    },
    assets: desk.assets,
  };
}
