/**
 * Non-trading research intel — macro snapshot and wire digest for agent marketplaces (Poncho, x402scan).
 */
import { selectRelevantLoungeMemory, listRecentWireHeadlines, type LoungeMemoryItem } from "./lounge-memory";
import { fetchConciergeMarketSnapshot } from "./market-data";
import { fetchMarketHeadlines, type NewsHeadline } from "./market-sources";

export type WireIntelBody = {
  message?: string;
  category?: string;
  limit?: number;
};

export type WireIntelItem = {
  title: string;
  source: string;
  category: string | null;
  url: string | null;
  published: string | null;
  summary: string | null;
  origin: "live" | "lounge";
};

function clampLimit(raw: unknown, fallback = 10, max = 20): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.round(n)));
}

function matchesCategory(category: string | undefined, itemCategory: string): boolean {
  if (!category?.trim()) return true;
  return itemCategory.toLowerCase().includes(category.trim().toLowerCase());
}

function headlineToWire(h: NewsHeadline, origin: "live" | "lounge"): WireIntelItem {
  return {
    title: h.title,
    source: h.source,
    category: null,
    url: h.url ?? null,
    published: h.published ?? null,
    summary: h.summary ?? null,
    origin,
  };
}

function memoryToWire(item: LoungeMemoryItem): WireIntelItem {
  return {
    title: item.title,
    source: item.source,
    category: item.category || null,
    url: item.url ?? null,
    published: item.lastSeenAt,
    summary: item.summary || null,
    origin: "lounge",
  };
}

function dedupeWire(items: WireIntelItem[]): WireIntelItem[] {
  const seen = new Set<string>();
  const out: WireIntelItem[] = [];
  for (const item of items) {
    const key = `${item.source}|${item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function runMacroIntel(): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const snapshot = await fetchConciergeMarketSnapshot({ mode: "standard" });

  const macroMarks = snapshot.ticks
    .filter((t) => ["SPX", "NDX", "VIX", "DXY", "GOLD", "BTC", "ETH"].includes(t.symbol.toUpperCase()))
    .map((t) => ({
      symbol: t.symbol.toUpperCase(),
      price: t.price,
      change24h: t.change,
    }));

  return {
    ok: true,
    kind: "intel-macro",
    dataAsOf: fetchedAt,
    sources: snapshot.sources,
    marks: macroMarks,
    sentiment: snapshot.sentiment
      ? { index: snapshot.sentiment.index, label: snapshot.sentiment.label }
      : null,
    macro: snapshot.macro
      ? {
          treasuryYields: snapshot.macro.yields,
          upcomingEvents: snapshot.macro.upcomingEvents,
          centralBankHeadlines: snapshot.macro.centralBankHeadlines.slice(0, 8),
          macroHeadlines: snapshot.macro.macroHeadlines.slice(0, 10),
        }
      : null,
    cryptoContext: snapshot.globalCrypto
      ? {
          totalMarketCapUsd: snapshot.globalCrypto.totalMarketCapUsd,
          btcDominance: snapshot.globalCrypto.btcDominance,
          marketCapChange24h: snapshot.globalCrypto.marketCapChange24h,
        }
      : null,
    headlines: snapshot.headlines.slice(0, 6).map((h) => headlineToWire(h, "live")),
  };
}

export async function runWireIntel(body: WireIntelBody): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const limit = clampLimit(body.limit, 10);
  const category = body.category?.trim();
  const message = String(body.message ?? "").trim();

  const [liveHeadlines, loungeItems] = await Promise.all([
    fetchMarketHeadlines(4),
    message
      ? selectRelevantLoungeMemory(message, limit * 2)
      : listRecentWireHeadlines(limit * 2),
  ]);

  const wireFromLounge = loungeItems
    .filter((i) => i.kind === "wire_headline")
    .filter((i) => matchesCategory(category, i.category))
    .map(memoryToWire);

  const wireFromLive = liveHeadlines.map((h) => headlineToWire(h, "live"));

  const headlines = dedupeWire([...wireFromLive, ...wireFromLounge]).slice(0, limit);

  return {
    ok: true,
    kind: "intel-wire",
    dataAsOf: fetchedAt,
    sources: [
      "Executive Lounge wire memory",
      "Public RSS headlines",
      ...(message ? ["Relevance-ranked by message"] : []),
    ],
    filters: {
      category: category ?? null,
      message: message || null,
      limit,
    },
    headlines,
    note: "Use POST /api/news-open to unlock a full article URL from the Lounge wire.",
  };
}
