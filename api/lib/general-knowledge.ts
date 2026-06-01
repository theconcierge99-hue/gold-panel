/** General / world knowledge feeds (free public APIs + RSS + Wikipedia). */

const FETCH_MS = 4_500;

export type KnowledgeArticle = {
  source: string;
  title: string;
  excerpt: string;
};

export type GeneralKnowledgeSnapshot = {
  fetchedAt: string;
  wikipedia: KnowledgeArticle[];
  worldNews: { source: string; title: string }[];
  instantAnswer?: { source: string; text: string; url?: string };
  sources: string[];
};

const STOPWORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "its", "may", "new", "now", "old", "see", "way", "who", "did",
  "let", "put", "say", "she", "too", "use", "with", "from", "this", "that",
  "will", "your", "about", "into", "than", "them", "then", "there", "these",
  "those", "been", "being", "have", "were", "would", "could", "should",
  "apa", "adalah", "yang", "dan", "di", "ke", "dari", "untuk", "pada",
  "dengan", "ini", "itu", "atau", "juga", "saya", "kamu", "akan", "bisa",
  "bagaimana", "mengapa", "kenapa", "kapan", "dimana",
]);

const WORLD_RSS: { url: string; source: string }[] = [
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC World" },
  { url: "https://feeds.npr.org/1001/rss.xml", source: "NPR News" },
  { url: "https://www.theguardian.com/world/rss", source: "The Guardian" },
];

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
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "ExecutiveLounge/1.0",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
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

function parseRssTitles(xml: string, source: string, max = 2): { source: string; title: string }[] {
  const out: { source: string; title: string }[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && out.length < max) {
    const titleM = m[1].match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleM) continue;
    const title = decodeXml(titleM[1]).slice(0, 200);
    if (title) out.push({ source, title });
  }
  return out;
}

export function extractKnowledgeQueries(message: string, maxQueries = 2): string[] {
  const cleaned = message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));

  const queries: string[] = [];
  if (meaningful.length >= 2) {
    queries.push(meaningful.slice(0, 4).join(" "));
  }
  if (meaningful[0] && !queries.includes(meaningful[0])) {
    queries.push(meaningful[0]);
  }
  if (!queries.length && cleaned.length >= 3) {
    queries.push(cleaned.slice(0, 72));
  }
  if (!queries.length) {
    queries.push("current world events");
  }
  return [...new Set(queries)].slice(0, maxQueries);
}

async function wikipediaSearchTitles(query: string, limit = 2): Promise<string[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}` +
    `&limit=${limit}&namespace=0&format=json`;
  const data = await fetchJson<[string, string[]]>(url);
  return data?.[1]?.slice(0, limit) ?? [];
}

async function wikipediaSummary(title: string): Promise<KnowledgeArticle | null> {
  const safe = encodeURIComponent(title.replace(/ /g, "_"));
  const data = await fetchJson<{
    title?: string;
    extract?: string;
    description?: string;
  }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${safe}`);
  if (!data?.extract) return null;
  const excerpt = (data.description ? `${data.description}. ` : "") + data.extract;
  return {
    source: "Wikipedia",
    title: data.title ?? title,
    excerpt: excerpt.slice(0, 520),
  };
}

async function fetchWikipediaForQueries(queries: string[]): Promise<KnowledgeArticle[]> {
  const articles: KnowledgeArticle[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    const titles = await wikipediaSearchTitles(q, 2);
    for (const title of titles) {
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const article = await wikipediaSummary(title);
      if (article) articles.push(article);
      if (articles.length >= 3) return articles;
    }
  }
  return articles;
}

async function fetchDuckDuckGoInstant(query: string): Promise<GeneralKnowledgeSnapshot["instantAnswer"] | null> {
  const url =
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}` +
    "&format=json&no_redirect=1&no_html=1&skip_disambig=1";
  const data = await fetchJson<{
    AbstractText?: string;
    Heading?: string;
    AbstractURL?: string;
  }>(url);
  if (!data?.AbstractText?.trim()) return null;
  return {
    source: "DuckDuckGo Instant Answer",
    text: data.AbstractText.slice(0, 480),
    url: data.AbstractURL,
  };
}

async function fetchWorldNews(maxPerFeed = 2): Promise<{ source: string; title: string }[]> {
  const results = await Promise.all(
    WORLD_RSS.map(async ({ url, source }) => {
      const xml = await fetchText(url);
      if (!xml) return [];
      return parseRssTitles(xml, source, maxPerFeed);
    }),
  );
  return results.flat().slice(0, 8);
}

export type GeneralKnowledgeMode = "full" | "lite" | "trading";

function isMarketFocusedQuery(message: string): boolean {
  return /\b(trading plan|trade plan|btc|eth|sol|crypto|macro|entry|stop|target|funding|oi|bias|saham|stock|nvda|aapl)\b/i.test(
    message,
  );
}

function resolveKnowledgeMode(
  message: string,
  options?: { lite?: boolean; mode?: GeneralKnowledgeMode },
): GeneralKnowledgeMode {
  if (options?.mode) return options.mode;
  if (options?.lite) return "lite";
  if (
    /\b(trading plan|trade plan|rencana trading|analisa|analisis|fundamental|teknikal|geopolit|outlook|bias|entry|stop|target|r:r|saham|stock)\b/i.test(
      message,
    )
  ) {
    return "trading";
  }
  if (isMarketFocusedQuery(message)) return "lite";
  return "full";
}

/** Aggregate general knowledge for Concierge (runs in parallel with market data). */
export async function fetchGeneralKnowledgeSnapshot(
  userMessage: string,
  options?: { lite?: boolean; mode?: GeneralKnowledgeMode },
): Promise<GeneralKnowledgeSnapshot> {
  const queries = extractKnowledgeQueries(userMessage);
  const mode = resolveKnowledgeMode(userMessage, options);

  if (mode === "lite") {
    const instantAnswer = await fetchDuckDuckGoInstant(queries[0]);
    const sources = instantAnswer ? ["DuckDuckGo"] : [];
    return {
      fetchedAt: new Date().toISOString(),
      wikipedia: [],
      worldNews: [],
      instantAnswer: instantAnswer ?? undefined,
      sources,
    };
  }

  if (mode === "trading") {
    const [instantAnswer, worldNews] = await Promise.all([
      fetchDuckDuckGoInstant(queries[0]),
      fetchWorldNews(2),
    ]);
    const sources: string[] = [];
    if (instantAnswer) sources.push("DuckDuckGo");
    if (worldNews.length) {
      sources.push(`World news (${[...new Set(worldNews.map((n) => n.source))].join(", ")})`);
    }
    return {
      fetchedAt: new Date().toISOString(),
      wikipedia: [],
      worldNews,
      instantAnswer: instantAnswer ?? undefined,
      sources,
    };
  }

  const [wikipedia, worldNews, instantAnswer] = await Promise.all([
    fetchWikipediaForQueries(queries),
    fetchWorldNews(2),
    fetchDuckDuckGoInstant(queries[0]),
  ]);

  const sources: string[] = [];
  if (wikipedia.length) sources.push("Wikipedia");
  if (instantAnswer) sources.push("DuckDuckGo");
  if (worldNews.length) {
    sources.push(`World news (${[...new Set(worldNews.map((n) => n.source))].join(", ")})`);
  }

  return {
    fetchedAt: new Date().toISOString(),
    wikipedia,
    worldNews,
    instantAnswer: instantAnswer ?? undefined,
    sources,
  };
}

export function formatGeneralKnowledgeForPrompt(snap: GeneralKnowledgeSnapshot): string {
  if (!snap.sources.length) {
    return "GENERAL KNOWLEDGE: No external general feeds returned — use trained knowledge; label uncertain claims.";
  }

  const lines: string[] = [
    `GENERAL KNOWLEDGE INTELLIGENCE (fetched ${snap.fetchedAt}):`,
    `Sources: ${snap.sources.join(" · ")}`,
    "Use for history, science, culture, geography, current affairs, and non-market questions. Cite source names. Cross-check with market block when topics overlap.",
  ];

  if (snap.instantAnswer) {
    lines.push(
      `\n[INSTANT REFERENCE — ${snap.instantAnswer.source}]`,
      snap.instantAnswer.text,
    );
  }

  for (const w of snap.wikipedia) {
    lines.push(`\n[WIKIPEDIA — ${w.title}]`, w.excerpt);
  }

  if (snap.worldNews.length) {
    lines.push(
      "\n[WORLD NEWS & GEOPOLITICAL HEADLINES]",
      "Use for regime narrative, sanctions/conflict/election risk, and cross-asset transmission (energy, gold, DXY, risk assets).",
    );
    for (const n of snap.worldNews) {
      lines.push(`- [${n.source}]: ${n.title}`);
    }
  }

  return lines.join("\n");
}
