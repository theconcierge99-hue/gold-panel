import { buildTrendingNarratives, enrichHeadlinesForUi } from "./headline-ui";
import { fetchDevCreatorHeadlines } from "./dev-creator-sync";
import { ingestWireHeadlinesAsync } from "./lounge-memory";
import { fetchLiveMarketSnapshot, ticksForUi } from "./market-data";
import { listCreatorHeadlinesForUi } from "./signal-ui";

export async function buildLoungeMarketPayload() {
  const snapshot = await fetchLiveMarketSnapshot();
  ingestWireHeadlinesAsync(snapshot.headlines);
  const wire = enrichHeadlinesForUi(snapshot.headlines);
  let creator: Awaited<ReturnType<typeof listCreatorHeadlinesForUi>> = [];
  try {
    creator = await listCreatorHeadlinesForUi();
    if (creator.length === 0) {
      creator = await fetchDevCreatorHeadlines();
    }
  } catch (e) {
    console.error("[market] creator signals", e instanceof Error ? e.message : e);
  }
  const headlines = [...creator, ...wire];
  return {
    fetchedAt: snapshot.fetchedAt,
    ticks: ticksForUi(snapshot),
    derivatives: snapshot.derivatives,
    positioning: snapshot.positioning,
    globalCrypto: snapshot.globalCrypto,
    sentiment: snapshot.sentiment,
    defi: snapshot.defi,
    btcNetwork: snapshot.btcNetwork,
    creatorHeadlines: creator,
    wireHeadlines: wire,
    headlines,
    narratives: buildTrendingNarratives(headlines),
    sources: snapshot.sources,
    creatorSignalCount: creator.length,
    wireHeadlineCount: wire.length,
  };
}
