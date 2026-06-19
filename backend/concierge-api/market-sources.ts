/** Third-party market & narrative feeds (free/public APIs + RSS). */

const FETCH_MS = 4_500;

export type NewsHeadline = {
  source: string;
  title: string;
  published?: string;
  url?: string;
  summary?: string;
  category?: string;
};

export type GlobalCryptoContext = {
  totalMarketCapUsd: string;
  volume24hUsd: string;
  btcDominance: string;
  marketCapChange24h: string;
};

export type SentimentContext = {
  index: number;
  label: string;
};

export type DefiProtocolRow = { name: string; tvlUsd: string };

export type DefiContext = {
  totalTvlUsd: string;
  topProtocols: DefiProtocolRow[];
};

export type BtcNetworkContext = {
  fastFeeSatVb: string;
  hourFeeSatVb: string;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { Accept: "application/json", "User-Agent": "ExecutiveLounge/1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs = FETCH_MS): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "ExecutiveLounge/1.0" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function fmtUsd(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
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

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractRssLink(block: string): string | undefined {
  const atom = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom?.[1]?.startsWith("http")) return atom[1].trim();
  const plain = block.match(/<link[^>]*>([^<]+)<\/link>/i);
  const url = plain?.[1]?.trim();
  if (url?.startsWith("http")) return url;
  const guid = block.match(/<guid[^>]*>([^<]+)<\/guid>/i);
  const g = guid?.[1]?.trim();
  if (g?.startsWith("http")) return g;
  return undefined;
}

function extractRssSummary(block: string): string | undefined {
  const descM =
    block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
    block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
  if (!descM) return undefined;
  const text = decodeXml(descM[1]).replace(/\s+/g, " ").trim();
  if (!text || text.length < 12) return undefined;
  return text.slice(0, 320);
}

function parseRssHeadlines(xml: string, source: string, max = 3): NewsHeadline[] {
  const out: NewsHeadline[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && out.length < max) {
    const block = m[1];
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleM) continue;
    const title = decodeXml(titleM[1]).slice(0, 220);
    if (!title) continue;
    const pubM = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const published = pubM ? decodeXml(pubM[1]).slice(0, 48) : undefined;
    const url = extractRssLink(block);
    const summary = extractRssSummary(block);
    out.push({
      source,
      title,
      published,
      url,
      summary,
    });
  }
  return out;
}

/** Free public RSS — crypto, markets, macro, world & business (not paid terminals) */
const RSS_FEEDS: { url: string; source: string }[] = [
  // Crypto
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
  { url: "https://www.theblock.co/rss.xml", source: "The Block" },
  // Markets & finance
  { url: "https://feeds.bloomberg.com/markets/news.rss", source: "Bloomberg" },
  { url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters" },
  { url: "https://www.ft.com/rss/home", source: "Financial Times" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", source: "WSJ" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", source: "CNBC" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", source: "MarketWatch" },
  { url: "https://finance.yahoo.com/news/rssindex", source: "Yahoo Finance" },
  { url: "https://www.forbes.com/business/feed/", source: "Forbes" },
  { url: "https://fortune.com/feed/", source: "Fortune" },
  { url: "https://www.economist.com/finance-and-economics/rss.xml", source: "The Economist" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", source: "NYT Business" },
  // TV & global news
  { url: "http://rss.cnn.com/rss/cnn_topstories.rss", source: "CNN" },
  { url: "http://rss.cnn.com/rss/money_latest.rss", source: "CNN Business" },
  { url: "https://www.cbsnews.com/latest/rss/main", source: "CBS News" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
  { url: "https://www.investing.com/rss/news.rss", source: "Investing.com" },
  { url: "https://feeds.bbci.co.uk/news/rss.xml", source: "BBC News" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC Business" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC World" },
  { url: "https://www.theguardian.com/business/rss", source: "Guardian" },
  { url: "https://feeds.npr.org/1001/rss.xml", source: "NPR" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
  { url: "https://rss.politico.com/economy.xml", source: "Politico" },
  { url: "https://feeds.skynews.com/feeds/rss/business.xml", source: "Sky News" },
  { url: "https://feeds.reuters.com/Reuters/worldNews", source: "Reuters World" },
];

/** Official central bank & macro policy RSS (Fed, ECB, BoE, BIS, Reuters Fed). */
export const CENTRAL_BANK_RSS_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", source: "Federal Reserve" },
  { url: "https://www.federalreserve.gov/feeds/speeches.xml", source: "Fed Speeches" },
  { url: "https://www.bankofengland.co.uk/rss/news", source: "Bank of England" },
  { url: "https://www.ecb.europa.eu/press/pressconf/shared/data/all_ecb_press_releases.en.rss", source: "ECB" },
  { url: "https://www.bis.org/pressreleases/rss.xml", source: "BIS" },
  { url: "https://feeds.reuters.com/news/wealth/fed", source: "Reuters · Fed" },
];

export async function fetchHeadlinesFromFeeds(
  feeds: { url: string; source: string }[],
  maxPerFeed = 2,
  timeoutMs = FETCH_MS,
): Promise<NewsHeadline[]> {
  const results = await Promise.all(
    feeds.map(async ({ url, source }) => {
      const xml = await fetchText(url, timeoutMs);
      if (!xml) return [] as NewsHeadline[];
      return parseRssHeadlines(xml, source, maxPerFeed);
    }),
  );
  const seen = new Set<string>();
  const merged: NewsHeadline[] = [];
  for (const h of results.flat()) {
    const key = h.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(h);
  }
  merged.sort((a, b) => headlineSortTime(b.published) - headlineSortTime(a.published));
  return merged;
}

function headlineSortTime(raw?: string): number {
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

export async function fetchCoinGeckoGlobal(): Promise<GlobalCryptoContext | null> {
  const data = await fetchJson<{
    data?: {
      total_market_cap?: { usd?: number };
      total_volume?: { usd?: number };
      market_cap_change_percentage_24h_usd?: number;
      market_cap_percentage?: { btc?: number };
    };
  }>("https://api.coingecko.com/api/v3/global");
  const g = data?.data;
  if (!g) return null;
  return {
    totalMarketCapUsd: fmtUsd(g.total_market_cap?.usd ?? NaN),
    volume24hUsd: fmtUsd(g.total_volume?.usd ?? NaN),
    btcDominance: Number.isFinite(g.market_cap_percentage?.btc)
      ? `${g.market_cap_percentage!.btc!.toFixed(1)}%`
      : "—",
    marketCapChange24h: fmtPct(g.market_cap_change_percentage_24h_usd ?? NaN),
  };
}

export async function fetchFearGreed(): Promise<SentimentContext | null> {
  const data = await fetchJson<{
    data?: { value?: string; value_classification?: string }[];
  }>("https://api.alternative.me/fng/?limit=1");
  const row = data?.data?.[0];
  const index = Number(row?.value);
  if (!Number.isFinite(index)) return null;
  return {
    index,
    label: row?.value_classification ?? "—",
  };
}

export async function fetchDefiLlama(): Promise<DefiContext | null> {
  const protocols = await fetchJson<{ name: string; tvl: number; category?: string }[]>(
    "https://api.llama.fi/protocols",
  );
  if (!protocols?.length) return null;

  const sorted = [...protocols]
    .filter((p) => Number.isFinite(p.tvl) && p.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 5);

  const total = protocols.reduce((s, p) => s + (Number.isFinite(p.tvl) ? p.tvl : 0), 0);

  return {
    totalTvlUsd: fmtUsd(total),
    topProtocols: sorted.map((p) => ({
      name: p.name,
      tvlUsd: fmtUsd(p.tvl),
    })),
  };
}

export async function fetchBtcNetwork(): Promise<BtcNetworkContext | null> {
  const data = await fetchJson<{ fastestFee?: number; hourFee?: number }>(
    "https://mempool.space/api/v1/fees/recommended",
  );
  if (!data) return null;
  return {
    fastFeeSatVb: Number.isFinite(data.fastestFee) ? `${data.fastestFee} sat/vB` : "—",
    hourFeeSatVb: Number.isFinite(data.hourFee) ? `${data.hourFee} sat/vB` : "—",
  };
}

export async function fetchMarketHeadlines(maxPerFeed = 2): Promise<NewsHeadline[]> {
  const merged = await fetchHeadlinesFromFeeds(RSS_FEEDS, maxPerFeed);
  return merged.slice(0, 48);
}
