import type { MarketTick } from "./concierge-brain";

const FETCH_MS = 4_500;

export type DerivativeSnap = {
  symbol: string;
  fundingRate: string;
  openInterest: string;
  markPrice: string;
};

export type LiveMarketSnapshot = {
  fetchedAt: string;
  ticks: MarketTick[];
  derivatives: DerivativeSnap[];
  sources: string[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_MS),
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

async function binanceSpot(): Promise<MarketTick[]> {
  const data = await fetchJson<
    { symbol: string; lastPrice: string; priceChangePercent: string }[]
  >(
    'https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]',
  );
  if (!data) return [];

  const map: Record<string, string> = {
    BTCUSDT: "BTC",
    ETHUSDT: "ETH",
    SOLUSDT: "SOL",
  };

  return data
    .filter((r) => map[r.symbol])
    .map((r) => ({
      symbol: map[r.symbol],
      price: fmtUsd(Number(r.lastPrice), r.symbol === "BTC" ? 0 : 2),
      change: fmtPct(Number(r.priceChangePercent)),
    }));
}

async function binanceFutures(): Promise<DerivativeSnap[]> {
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
        ),
        fetchJson<{ openInterest: string }>(
          `https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`,
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

async function yahooQuote(yahooSymbol: string, label: string): Promise<MarketTick | null> {
  const data = await fetchJson<{
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
      }[];
    };
  }>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`,
  );

  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prev = meta?.chartPreviousClose;
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;

  const chg = ((price! - prev!) / prev!) * 100;
  const decimals = label === "DXY" ? 2 : 0;
  return {
    symbol: label,
    price: label === "DXY" ? price!.toFixed(2) : fmtUsd(price!, decimals),
    change: fmtPct(chg),
  };
}

/** Server-side live feed — Binance (crypto + perps) + Yahoo (SPX, DXY proxy) */
export async function fetchLiveMarketSnapshot(): Promise<LiveMarketSnapshot> {
  const [spot, derivs, spx, dxy] = await Promise.all([
    binanceSpot(),
    binanceFutures(),
    yahooQuote("^GSPC", "SPX"),
    yahooQuote("DX-Y.NYB", "DXY"),
  ]);

  const ticks: MarketTick[] = [...spot];
  if (spx) ticks.push(spx);
  if (dxy) ticks.push(dxy);

  const sources: string[] = [];
  if (spot.length) sources.push("Binance spot");
  if (derivs.length) sources.push("Binance futures");
  if (spx || dxy) sources.push("Yahoo Finance");

  return {
    fetchedAt: new Date().toISOString(),
    ticks,
    derivatives: derivs,
    sources,
  };
}

export function formatLiveMarketForPrompt(snapshot: LiveMarketSnapshot): string {
  const lines: string[] = [
    `LIVE MARKET DATA (real-time feed, fetched ${snapshot.fetchedAt}, sources: ${snapshot.sources.join(", ")}):`,
    "Use these figures as authoritative for price, 24h change, funding, and OI. Do not invent alternate spot prices.",
  ];

  for (const t of snapshot.ticks) {
    lines.push(`- ${t.symbol} spot/index: ${t.price} (${t.change} 24h)`);
  }

  for (const d of snapshot.derivatives) {
    lines.push(
      `- ${d.symbol} perps: mark ${d.markPrice}, funding ${d.fundingRate}, open interest ≈ ${d.openInterest}`,
    );
  }

  if (snapshot.derivatives.length) {
    lines.push(
      "- Liquidation cluster read: infer from funding sign (positive = longs pay, crowded long risk) and OI level vs recent regime; state uncertainty bands if exact heatmap unavailable.",
    );
  }

  return lines.join("\n");
}

export function ticksForUi(snapshot: LiveMarketSnapshot): MarketTick[] {
  return snapshot.ticks;
}
