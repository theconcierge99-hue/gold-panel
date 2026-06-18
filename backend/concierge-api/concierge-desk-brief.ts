/**
 * Composite desk brief — macro + Meteora yields + verdict in one paid call.
 */
import { runMacroIntel } from "./concierge-research-intel";
import { runMeteoraIntel } from "./concierge-meteora-intel";
import {
  buildVerdict,
  fetchTopYields,
  formatInsiderFromMemory,
  type DeskVerdict,
} from "./concierge-defi-intel";
import { fetchConciergeMarketSnapshot } from "./market-data";
import { fetchFearGreed } from "./market-sources";
import { selectRelevantLoungeMemory } from "./lounge-memory";
import type { IntelRequestBody } from "./concierge-intel-handler";

export async function runDeskBriefIntel(body: IntelRequestBody): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const message = String(body.message ?? "market desk brief").trim();
  const includeInsider = body.includeInsider !== false;

  const [macro, meteora, snapshot, sentiment, yields, memoryItems] = await Promise.all([
    runMacroIntel(),
    runMeteoraIntel({ limit: 6, sortByApy: true }),
    fetchConciergeMarketSnapshot({ mode: "trading", message }),
    fetchFearGreed(),
    fetchTopYields({ chain: "solana", projectHint: "meteora", limit: 6 }),
    includeInsider && message
      ? selectRelevantLoungeMemory(message, 8)
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

  return {
    ok: true,
    kind: "intel-desk-brief",
    dataAsOf: fetchedAt,
    sources: [
      "Macro marks + Treasury (Concierge research desk)",
      "Meteora DLMM API",
      "DeFi Llama yields",
      "Binance positioning",
      "Alternative.me Fear & Greed",
      ...(insiderLines.length ? ["Lounge creator signals"] : []),
    ],
    context: message,
    brief: {
      headline: verdict.headline,
      signal: verdict.signal,
      confidence: verdict.confidence,
      macroSnapshot: {
        sentiment: macro.sentiment,
        marks: Array.isArray(macro.marks) ? macro.marks.slice(0, 6) : [],
      },
      meteoraTop: meteora.pools.slice(0, 4),
      verdict,
      insider: insiderLines.map((line) => ({ line })),
    },
    components: {
      macro,
      meteora: { pools: meteora.pools, topByTvl: meteora.topByTvl },
      verdict: {
        signal: verdict.signal,
        confidence: verdict.confidence,
        headline: verdict.headline,
        rationale: verdict.rationale,
      },
    },
  };
}
