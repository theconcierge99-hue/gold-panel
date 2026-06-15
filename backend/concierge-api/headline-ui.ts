import type { NewsHeadline } from "./market-sources";

export type UiHeadline = NewsHeadline & {
  category: string;
  categoryColor: string;
  ageLabel: string;
  score: number;
};

const CATEGORY_RULES: { label: string; color: string; keywords: string[] }[] = [
  { label: "Crypto", color: "#22c87a", keywords: ["bitcoin", "btc", "ethereum", "eth", "crypto", "defi", "blockchain", "solana", "token", "nft", "stablecoin", "web3", "binance", "coinbase"] },
  { label: "Macro · FX", color: "#c9a84c", keywords: ["fed", "federal reserve", "dollar", "dxy", "inflation", "gdp", "central bank", "treasury", "yield", "rates", "ecb", "boj", "boe", "fx", "currency", "nfp", "nonfarm", "payroll", "cpi", "ppi", "pce", "fomc", "pmi", "ism"] },
  { label: "Equities", color: "#8899bb", keywords: ["stock", "equity", "s&p", "nasdaq", "earnings", "ipo", "shares", "wall street", "dow"] },
  { label: "Technology", color: "#3b7dd8", keywords: ["ai", "artificial intelligence", "tech", "chip", "semiconductor", "nvidia", "microsoft", "apple", "google", "openai"] },
  { label: "Energy", color: "#e85d4a", keywords: ["oil", "brent", "wti", "gas", "opec", "energy", "crude", "petroleum"] },
  { label: "Gold / Silver", color: "#d4cfc4", keywords: ["gold", "silver", "precious", "xau"] },
  { label: "Geopolitics", color: "#e85d4a", keywords: ["war", "ukraine", "russia", "china", "taiwan", "sanction", "geopolit", "middle east", "israel", "gaza", "election", "trump", "biden", "nato", "conflict", "diplomat"] },
  { label: "Micro", color: "#1d8f7a", keywords: ["company", "merger", "acquisition", "ceo", "startup", "retail", "bank"] },
  { label: "DeFi", color: "#1d8f7a", keywords: ["uniswap", "aave", "liquidity", "tvl", "lending", "dex", "staking"] },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function categorizeHeadline(title: string, source: string): { label: string; color: string } {
  const t = `${title} ${source}`.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => t.includes(kw))) {
      return { label: rule.label, color: rule.color };
    }
  }
  return { label: "Markets", color: "#5a6a82" };
}

function parsePubDate(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function timeAgoLabel(raw?: string): string {
  const d = parsePubDate(raw);
  if (!d) return "Live";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function headlineScore(title: string, source: string): number {
  const h = hashStr(`${source}:${title}`);
  return Math.round((72 + (h % 27)) * 10) / 10;
}

export function enrichHeadlinesForUi(items: NewsHeadline[]): UiHeadline[] {
  return items.map((item) => {
    const { label, color } = categorizeHeadline(item.title, item.source);
    return {
      ...item,
      category: label,
      categoryColor: color,
      ageLabel: timeAgoLabel(item.published),
      score: headlineScore(item.title, item.source),
    };
  });
}

export type NarrativeRow = {
  category: string;
  categoryColor: string;
  title: string;
  scoreLabel: string;
  ageLabel: string;
  strength: "strong" | "moderate";
};

export function buildTrendingNarratives(headlines: UiHeadline[], max = 5): NarrativeRow[] {
  const byCat = new Map<string, UiHeadline[]>();
  for (const h of headlines) {
    const list = byCat.get(h.category) ?? [];
    list.push(h);
    byCat.set(h.category, list);
  }

  const ranked = [...byCat.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, max);

  return ranked.map(([category, list]) => {
    const top = list[0];
    const avg = list.reduce((s, x) => s + x.score, 0) / list.length;
    const score10 = Math.min(10, Math.round((avg / 10) * 10) / 10);
    return {
      category,
      categoryColor: top.categoryColor,
      title: top.title.length > 72 ? `${top.title.slice(0, 69)}…` : top.title,
      scoreLabel: `${score10.toFixed(1)} / 10`,
      ageLabel: top.ageLabel,
      strength: score10 >= 8.2 ? "strong" : "moderate",
    };
  });
}
