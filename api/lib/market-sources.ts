/** Third-party market & narrative feeds (free/public APIs + RSS). */

const FETCH_MS = 4_500;

export type NewsHeadline = {
  source: string;
  title: string;
  published?: string;
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

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_MS),
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
    out.push({
      source,
      title,
      published: pubM ? decodeXml(pubM[1]).slice(0, 40) : undefined,
    });
  }
  return out;
}

const RSS_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://feeds.bloomberg.com/markets/news.rss", source: "Bloomberg" },
  { url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters" },
  { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
  { url: "https://www.theblock.co/rss.xml", source: "The Block" },
];

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
  const results = await Promise.all(
    RSS_FEEDS.map(async ({ url, source }) => {
      const xml = await fetchText(url);
      if (!xml) return [] as NewsHeadline[];
      return parseRssHeadlines(xml, source, maxPerFeed);
    }),
  );
  return results.flat().slice(0, 12);
}
