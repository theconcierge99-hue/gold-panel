/**
 * Alpha desk intelligence — airdrop, listing, and momentum candidates.
 * Evidence priority: insider (Lounge signals) → institutional → onchain → narrative → KOL.
 */
import { formatInsiderFromMemory } from "./concierge-defi-intel";
import { fetchTopYields } from "./concierge-defi-intel";
import { normalizeGeminiApiKey } from "./concierge-gemini";
import {
  fetchConciergeMarketSnapshot,
  formatLiveMarketForPrompt,
  type PositioningSnap,
} from "./market-data";
import { fetchFearGreed } from "./market-sources";
import {
  formatGeneralKnowledgeForPrompt,
  fetchGeneralKnowledgeSnapshot,
} from "./general-knowledge";
import {
  formatLoungeMemoryForPrompt,
  listRecentCreatorSignals,
  selectRelevantLoungeMemory,
  type LoungeMemoryItem,
} from "./lounge-memory";
import { withTimeout } from "./with-timeout";
import type { X402IntelKind } from "./x402-pricing";

export type AlphaIntelKind = Extract<
  X402IntelKind,
  "intel-airdrop" | "intel-listing" | "intel-momentum"
>;

/** Optional momentum desk overlay — auto-detected from message when omitted. */
export type MomentumTheme = "robinhood" | "general";

export type AlphaIntelRequest = {
  message?: string;
  chain?: string;
  limit?: number;
  includeInsider?: boolean;
  /** Momentum only: Robinhood Chain meme rotation desk (Pump.fun cross-chain in SOL). */
  theme?: MomentumTheme;
};

export type AlphaInsiderRef = {
  title: string;
  summary?: string;
  signalId?: string;
  category?: string;
  weight: "primary" | "supporting";
};

export type AlphaCandidate = {
  asset: string;
  name: string;
  chain: string;
  thesis: string;
  conviction: "low" | "medium" | "high";
  timeHorizon: string;
  direction?: "up" | "down" | "neutral" | "watch";
  insiderWeight: "primary" | "supporting" | "none";
  insiderSignals: AlphaInsiderRef[];
  institutional: { notes: string; fundingBias?: string; positioningSkew?: string };
  onchain: { notes: string; tvlOrVolume?: string };
  narrative: { themes: string[]; headlineRefs: string[] };
  kol: { notes: string };
  riskFlags: string[];
  actionable: string;
};

const ALPHA_KIND_META: Record<
  AlphaIntelKind,
  { focusQuery: string; deskTitle: string; geminiTask: string; defaultHorizon: string }
> = {
  "intel-airdrop": {
    focusQuery: "airdrop points farming retroactive allocation token launch testnet mainnet eligibility",
    deskTitle: "Airdrop desk",
    geminiTask:
      "Identify protocols/tokens with credible airdrop potential. Weight Lounge INSIDER creator signals highest; corroborate with TVL growth, narrative, and onchain activity proxies.",
    defaultHorizon: "30d",
  },
  "intel-listing": {
    focusQuery: "exchange listing binance coinbase okx bybit spot perp announcement listing rumor",
    deskTitle: "Listing desk",
    geminiTask:
      "Identify tokens with plausible spot/perp listing catalysts. INSIDER Lounge signals first; then institutional volume narrative, headlines, and positioning.",
    defaultHorizon: "7d",
  },
  "intel-momentum": {
    focusQuery: "breakout breakdown volatility squeeze liquidations catalyst big move momentum",
    deskTitle: "Momentum desk",
    geminiTask:
      "Identify tokens likely to see large moves up OR down. INSIDER signals first; then crowded positioning (funding/L-S), Fear & Greed, headlines, and technical regime from live marks.",
    defaultHorizon: "48h",
  },
};

const ROBINHOOD_MOMENTUM_OVERLAY = {
  focusQuery:
    "Robinhood Chain memecoin CASHCAT pump.fun cross-chain SOL bridge Vlad Tenev NOXA Uniswap RH L2 meme rotation TVL",
  deskTitle: "Robinhood Chain momentum desk",
  geminiTask:
    "Scan Robinhood Chain meme rotation and Solana↔RH cross-chain flow. Include tokens tradable on Pump.fun in SOL without bridging. Weight flagship runners (e.g. CASHCAT) and fresh RH L2 graduates; contrast fleeting meme TVL vs sustainable agent-utility on Solana. INSIDER Lounge signals first; then headlines, bridge friction, and positioning.",
  defaultHorizon: "24h",
} as const;

const ROBINHOOD_DESK_CONTEXT = `ROBINHOOD CHAIN DESK CONTEXT (public narrative overlay):
- Robinhood Chain: Arbitrum-based L2; mainnet live early July 2026; CEO promoted meme activity alongside RWA roadmap.
- Pump.fun integration: Robinhood Chain tokens tradable in the Pump.fun app using SOL — "no bridging" UX for Solana traders.
- Bridge path: Robinhood Wallet supports Solana → Robinhood Chain (USDC → USDG via Across) for users who want native RH L2 exposure.
- Flagship meme meta: CASHCAT (Cash Cat mascot nod) — high volatility; watch graduation to Uniswap V3 on RH Chain.
- Agent angle: Solana agents rotating RH meta via Pump.fun should track liq depth, holder concentration, and post-spike mean reversion.
- Solana utility contrast: pay-per-call agent APIs on Solana (x402) can see TCX checkout demand independent of RH meme cycles — note only when evidence supports.`;

const ROBINHOOD_MESSAGE_RE =
  /\b(robinhood(?:\s+chain)?|rh\s+chain|cash\s*cat|cashcat|pump\.?fun\s+robinhood|robinhood\s+token|vlad\s+tenev|noxa)\b/i;

function resolveMomentumTheme(
  kind: AlphaIntelKind,
  message: string,
  theme?: MomentumTheme,
): MomentumTheme | null {
  if (kind !== "intel-momentum") return null;
  if (theme === "general") return null;
  if (theme === "robinhood") return "robinhood";
  return ROBINHOOD_MESSAGE_RE.test(message) ? "robinhood" : null;
}

function alphaKindMeta(kind: AlphaIntelKind, momentumTheme: MomentumTheme | null) {
  const base = ALPHA_KIND_META[kind];
  if (kind !== "intel-momentum" || momentumTheme !== "robinhood") return base;
  return {
    ...base,
    ...ROBINHOOD_MOMENTUM_OVERLAY,
    deskTitle: ROBINHOOD_MOMENTUM_OVERLAY.deskTitle,
  };
}

const GEMINI_MS = 20_000;
const TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(8, Math.max(1, Math.round(n)));
}

function combinedQuery(
  kind: AlphaIntelKind,
  message: string,
  momentumTheme: MomentumTheme | null,
): string {
  const meta = alphaKindMeta(kind, momentumTheme);
  return [message, meta.focusQuery].filter(Boolean).join(" ").trim();
}

function insiderRefs(items: LoungeMemoryItem[]): AlphaInsiderRef[] {
  return items
    .filter((i) => i.kind === "creator_signal")
    .slice(0, 6)
    .map((i, idx) => ({
      title: i.title,
      summary: i.summary?.slice(0, 280),
      signalId: i.signalId,
      category: i.category,
      weight: idx === 0 ? "primary" : "supporting",
    }));
}

function headlineMatches(
  text: string,
  kind: AlphaIntelKind,
  momentumTheme: MomentumTheme | null = null,
): boolean {
  const t = text.toLowerCase();
  if (kind === "intel-airdrop") {
    return /\b(airdrop|points|farming|retroactive|allocation|claim)\b/.test(t);
  }
  if (kind === "intel-listing") {
    return /\b(listing|listed|binance|coinbase|okx|bybit|spot market|perpetual)\b/.test(t);
  }
  if (momentumTheme === "robinhood") {
    if (
      /\b(robinhood|cash\s*cat|cashcat|pump\.?fun|memecoin|meme coin|bridge|layer 2|l2)\b/.test(t)
    ) {
      return true;
    }
  }
  return /\b(surge|plunge|rally|crash|breakout|breakdown|squeeze|liquidat|volatility|catalyst)\b/.test(
    t,
  );
}

function positioningSkew(pos: PositioningSnap[]): string {
  if (!pos.length) return "No live positioning in fetch.";
  return pos
    .map((p) => {
      const longPct = Number.parseFloat(p.topTraderLongPct);
      const bias = Number.isFinite(longPct)
        ? longPct > 55
          ? "crowded long"
          : longPct < 45
            ? "crowded short"
            : "balanced"
        : "unknown";
      return `${p.symbol}: L/S ${p.longShortRatio}, top-trader long ${p.topTraderLongPct}% (${bias})`;
    })
    .join("; ");
}

function buildAlphaContextBlock(input: {
  kind: AlphaIntelKind;
  message: string;
  momentumTheme: MomentumTheme | null;
  insiderItems: LoungeMemoryItem[];
  insiderLines: string[];
  liveBlock: string;
  generalBlock: string;
  yieldsNote: string;
  sentimentLabel: string | null;
  headlines: { title: string; source: string }[];
  positioning: PositioningSnap[];
}): string {
  const meta = alphaKindMeta(input.kind, input.momentumTheme);
  const insiderBlock = formatLoungeMemoryForPrompt(input.insiderItems);
  const insiderLines = input.insiderLines.length
    ? `INSIDER SIGNAL LINES (highest weight):\n${input.insiderLines.join("\n")}`
    : "INSIDER SIGNAL LINES: none in Lounge memory — rely on public data and label confidence lower.";

  const headlineBlock = input.headlines.length
    ? `NARRATIVE HEADLINES:\n${input.headlines.map((h) => `- [${h.source}] ${h.title}`).join("\n")}`
    : "";

  return [
    `ALPHA DESK: ${meta.deskTitle}`,
    input.momentumTheme === "robinhood" ? ROBINHOOD_DESK_CONTEXT : "",
    input.message ? `USER FOCUS: ${input.message}` : "",
    insiderBlock,
    insiderLines,
    input.liveBlock,
    input.generalBlock,
    input.yieldsNote,
    input.sentimentLabel ? `SENTIMENT: ${input.sentimentLabel}` : "",
    `INSTITUTIONAL POSITIONING: ${positioningSkew(input.positioning)}`,
    headlineBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseGeminiJson(raw: string): { summary?: string; candidates?: AlphaCandidate[] } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as { summary?: string; candidates?: AlphaCandidate[] };
  } catch {
    return null;
  }
}

async function synthesizeAlphaWithGemini(
  kind: AlphaIntelKind,
  contextBlock: string,
  message: string,
  limit: number,
  momentumTheme: MomentumTheme | null,
): Promise<{ summary: string; candidates: AlphaCandidate[] } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  let normalizedKey: string;
  try {
    normalizedKey = normalizeGeminiApiKey(apiKey);
  } catch {
    return null;
  }

  const meta = alphaKindMeta(kind, momentumTheme);
  const system = `You are Concierge Alpha Desk — institutional crypto intelligence synthesizer for agents.
${meta.geminiTask}

Evidence priority (mandatory):
1. INSIDER — Lounge creator signals (primary when present)
2. INSTITUTIONAL — derivatives positioning, funding, Fear & Greed
3. ONCHAIN — TVL/yield/volume proxies in context
4. NARRATIVE — wire headlines and themes
5. KOL — creator publisher context from insider block

Return JSON only (no markdown):
{
  "summary": "2-4 sentence desk summary in English",
  "candidates": [
    {
      "asset": "TICKER",
      "name": "Protocol or token name",
      "chain": "solana|ethereum|base|arbitrum|robinhood-chain|multi",
      "thesis": "complete thesis tied to evidence",
      "conviction": "low|medium|high",
      "timeHorizon": "${meta.defaultHorizon}",
      ${kind === "intel-momentum" ? '"direction": "up|down|neutral|watch",' : ""}
      "insiderWeight": "primary|supporting|none",
      "insiderSignals": [{ "title": "...", "summary": "...", "signalId": "...", "category": "...", "weight": "primary|supporting" }],
      "institutional": { "notes": "...", "fundingBias": "...", "positioningSkew": "..." },
      "onchain": { "notes": "...", "tvlOrVolume": "..." },
      "narrative": { "themes": ["..."], "headlineRefs": ["..."] },
      "kol": { "notes": "..." },
      "riskFlags": ["..."],
      "actionable": "one-line next step for a desk or agent"
    }
  ]
}

Rules:
- Return up to ${limit} candidates ranked by conviction.
- Never invent insider signals not present in INSIDER block.
- Complete every field; no truncated sentences.
- If evidence is thin, use conviction "low" and say what to watch.`;

  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `${contextBlock}\n\nUser focus: ${message || "(general scan)"}\n\nProduce JSON.` }],
      },
    ],
    generationConfig: { temperature: 0.45, maxOutputTokens: 4096, responseMimeType: "application/json" },
  };

  for (const model of TEXT_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(normalizedKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(GEMINI_MS),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const parsed = parseGeminiJson(text);
      if (parsed?.candidates?.length) {
        return {
          summary: parsed.summary ?? "Alpha desk scan complete.",
          candidates: parsed.candidates.slice(0, limit),
        };
      }
    } catch {
      /* try next model */
    }
  }
  return null;
}

function robinhoodMomentumSeeds(limit: number): AlphaCandidate[] {
  const seeds: AlphaCandidate[] = [
    {
      asset: "CASHCAT",
      name: "Cash Cat (Robinhood Chain meme)",
      chain: "robinhood-chain",
      thesis:
        "Flagship Robinhood Chain meme meta — high beta rotation play via Pump.fun SOL routing or native RH L2 Uniswap. Watch post-spike liq drain and bridge inflows from Solana.",
      conviction: "medium",
      timeHorizon: "24h",
      direction: "watch",
      insiderWeight: "none",
      insiderSignals: [],
      institutional: { notes: "Meme-led TVL spike — separate stablecoin vault flows from pure meme volume." },
      onchain: { notes: "Track RH Chain DEX volume vs Solana-side Pump.fun routing." },
      narrative: { themes: ["robinhood-chain", "memecoin", "pump.fun"], headlineRefs: [] },
      kol: { notes: "Narrative-driven — confirm with wire headlines before sizing." },
      riskFlags: ["Extreme volatility", "Meta rotation risk when next chain narrative emerges"],
      actionable: "Monitor Pump.fun RH tab + native RH L2 pair depth; size small or avoid after vertical moves.",
    },
    {
      asset: "SOL",
      name: "Solana (cross-chain routing hub)",
      chain: "solana",
      thesis:
        "Pump.fun Robinhood token trades settle in SOL — RH meta can lift Solana DEX/launchpad activity even when runners live on RH L2.",
      conviction: "low",
      timeHorizon: "48h",
      direction: "up",
      insiderWeight: "none",
      insiderSignals: [],
      institutional: { notes: "Correlate SOL perp positioning with launchpad activity spikes." },
      onchain: { notes: "Launchpad + routing volume proxy for RH meta participation." },
      narrative: { themes: ["solana", "pump.fun", "cross-chain"], headlineRefs: [] },
      kol: { notes: "Infrastructure read — not a meme pick." },
      riskFlags: ["SOL beta tied to broader crypto tape, not RH meta alone"],
      actionable: "Pair with /api/concierge-intel-whales for SOL positioning before chasing RH memes.",
    },
    {
      asset: "TCX",
      name: "TCX (Concierge pay-per-call utility)",
      chain: "solana",
      thesis:
        "Solana-native agent utility — x402 pay-per-call with TCX checkout (80% burn). Contrasts with RH meme rotation: demand from agent integrators, not pure meta chase.",
      conviction: "low",
      timeHorizon: "7d",
      direction: "watch",
      insiderWeight: "none",
      insiderSignals: [],
      institutional: { notes: "Utility token — track paid API volume, not RH meme correlation." },
      onchain: { notes: "Thin pool post-bonding — small buys/sells move mark; verify DexScreener liq." },
      narrative: { themes: ["agent-economy", "x402", "pay-per-call"], headlineRefs: [] },
      kol: { notes: "Product utility narrative — DYOR on revenue/buyback transparency." },
      riskFlags: ["Low liquidity", "Utility adoption lag vs meme narratives"],
      actionable: "Check /api/x402-config tokenPay + /token/transparency; pay intel in TCX to exercise burn loop.",
    },
  ];
  return seeds.slice(0, limit);
}

function fallbackCandidates(
  kind: AlphaIntelKind,
  insiderItems: LoungeMemoryItem[],
  headlines: { title: string; source: string }[],
  positioning: PositioningSnap[],
  limit: number,
  momentumTheme: MomentumTheme | null = null,
): { summary: string; candidates: AlphaCandidate[] } {
  const candidates: AlphaCandidate[] = [];
  const meta = alphaKindMeta(kind, momentumTheme);

  for (const item of insiderItems.filter((i) => i.kind === "creator_signal").slice(0, limit)) {
    const refs = insiderRefs([item]);
    candidates.push({
      asset: item.title.split(/\s+/)[0]?.toUpperCase().slice(0, 12) || "WATCH",
      name: item.title.slice(0, 80),
      chain: "multi",
      thesis: item.summary?.slice(0, 400) || item.title,
      conviction: "medium",
      timeHorizon: meta.defaultHorizon,
      ...(kind === "intel-momentum" ? { direction: "watch" as const } : {}),
      insiderWeight: "primary",
      insiderSignals: refs,
      institutional: { notes: positioningSkew(positioning) },
      onchain: { notes: "Correlate with DeFi TVL/yield endpoints for onchain depth." },
      narrative: { themes: [item.category], headlineRefs: [] },
      kol: { notes: "Lounge creator signal — treat as tactical insider overlay." },
      riskFlags: ["Unverified insider — cross-check with public data before sizing."],
      actionable: item.signalId
        ? `Review Lounge signal ${item.signalId}; unlock via /api/lounge-signal-open if needed.`
        : "Monitor Lounge feed for follow-up creator signals.",
    });
  }

  for (const h of headlines) {
    if (candidates.length >= limit) break;
    if (!headlineMatches(`${h.title} ${h.source}`, kind, momentumTheme)) continue;
    candidates.push({
      asset: "MACRO",
      name: h.title.slice(0, 80),
      chain: "multi",
      thesis: `Wire narrative: ${h.title} (${h.source}).`,
      conviction: "low",
      timeHorizon: meta.defaultHorizon,
      ...(kind === "intel-momentum" ? { direction: "watch" as const } : {}),
      insiderWeight: "none",
      insiderSignals: [],
      institutional: { notes: positioningSkew(positioning) },
      onchain: { notes: "No direct onchain read from headline alone." },
      narrative: { themes: [kind.replace("intel-", "")], headlineRefs: [h.title] },
      kol: { notes: "Public wire — not Lounge insider." },
      riskFlags: ["Headline-only thesis — confirm with positioning and insider overlay."],
      actionable: "Validate with /api/concierge-intel-whales and Concierge chat for levels.",
    });
  }

  if (kind === "intel-momentum" && momentumTheme === "robinhood" && candidates.length < limit) {
    for (const seed of robinhoodMomentumSeeds(limit - candidates.length)) {
      candidates.push(seed);
      if (candidates.length >= limit) break;
    }
  }

  if (kind === "intel-momentum" && candidates.length < limit) {
    for (const p of positioning) {
      const longPct = Number.parseFloat(p.topTraderLongPct);
      if (!Number.isFinite(longPct)) continue;
      const crowded = longPct > 58 || longPct < 42;
      if (!crowded) continue;
      candidates.push({
        asset: p.symbol,
        name: `${p.symbol} perp momentum`,
        chain: "multi",
        thesis:
          longPct > 58
            ? `${p.symbol} top-trader long ${p.topTraderLongPct}% — crowded long; downside liq cascade risk or squeeze on strength.`
            : `${p.symbol} top-trader long ${p.topTraderLongPct}% — crowded short; squeeze risk on relief rally.`,
        conviction: "medium",
        timeHorizon: "48h",
        direction: longPct > 58 ? "down" : "up",
        insiderWeight: "none",
        insiderSignals: [],
        institutional: {
          notes: positioningSkew([p]),
          positioningSkew: longPct > 58 ? "crowded long" : "crowded short",
        },
        onchain: { notes: "Derivatives-led momentum read — not spot onchain." },
        narrative: { themes: ["positioning", "liquidations"], headlineRefs: [] },
        kol: { notes: "Institutional desk proxy via Binance top-trader ratios." },
        riskFlags: ["Crowded-trade mean reversion risk."],
        actionable: `Watch ${p.symbol} funding resets and liq clusters; confirm with Concierge chat.`,
      });
      if (candidates.length >= limit) break;
    }
  }

  const summary =
    candidates.length > 0
      ? `${meta.deskTitle}: ${candidates.length} candidate(s) from Lounge insider + public overlays.`
      : `${meta.deskTitle}: no high-confidence candidates in current Lounge memory — broaden query or publish creator signals.`;

  return { summary, candidates: candidates.slice(0, limit) };
}

export async function runAlphaIntel(
  kind: AlphaIntelKind,
  body: AlphaIntelRequest,
): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const message = String(body.message ?? "").trim();
  const limit = clampLimit(body.limit);
  const includeInsider = body.includeInsider !== false;
  const momentumTheme = resolveMomentumTheme(kind, message, body.theme);
  const query = combinedQuery(kind, message, momentumTheme);

  const [relevantMemory, recentInsider, snapshot, sentiment, yields, general] = await Promise.all([
    withTimeout(selectRelevantLoungeMemory(query, 14), 4_000, []),
    includeInsider ? withTimeout(listRecentCreatorSignals(10), 3_000, []) : Promise.resolve([]),
    withTimeout(
      fetchConciergeMarketSnapshot({ mode: "trading", message: query }),
      6_000,
      {
        fetchedAt,
        ticks: [],
        derivatives: [],
        positioning: [],
        headlines: [],
        sources: [],
      },
    ),
    withTimeout(fetchFearGreed(), 3_000, null),
    withTimeout(fetchTopYields({ chain: body.chain, limit: 6 }), 4_000, []),
    withTimeout(fetchGeneralKnowledgeSnapshot(query, { mode: "lite" }), 3_500, {
      fetchedAt,
      wikipedia: [],
      worldNews: [],
      sources: [],
    }),
  ]);

  const insiderMap = new Map<string, LoungeMemoryItem>();
  for (const item of [...recentInsider, ...relevantMemory]) {
    if (item.kind === "creator_signal") insiderMap.set(item.id, item);
  }
  const insiderItems = [...insiderMap.values()].slice(0, 10);
  const insiderLines = formatInsiderFromMemory(insiderItems);

  const matchedHeadlines = snapshot.headlines
    .filter((h) => headlineMatches(`${h.title} ${h.summary ?? ""}`, kind, momentumTheme))
    .slice(0, 8)
    .map((h) => ({ title: h.title, source: h.source }));

  const liveBlock = formatLiveMarketForPrompt(snapshot);
  const generalBlock = formatGeneralKnowledgeForPrompt(general);
  const yieldsNote = yields.length
    ? `ONCHAIN YIELDS (supporting): ${yields
        .slice(0, 4)
        .map((y) => `${y.project} ${y.symbol} ${y.apy} on ${y.chain}`)
        .join("; ")}`
    : "";

  const contextBlock = buildAlphaContextBlock({
    kind,
    message,
    momentumTheme,
    insiderItems,
    insiderLines,
    liveBlock,
    generalBlock,
    yieldsNote,
    sentimentLabel: sentiment ? `${sentiment.index}/100 ${sentiment.label}` : null,
    headlines: matchedHeadlines,
    positioning: snapshot.positioning,
  });

  const synthesized =
    (await synthesizeAlphaWithGemini(kind, contextBlock, message, limit, momentumTheme)) ??
    fallbackCandidates(
      kind,
      insiderItems,
      matchedHeadlines,
      snapshot.positioning,
      limit,
      momentumTheme,
    );

  const sources = [
    ...(insiderItems.length ? ["Lounge insider (creator signals)"] : []),
    "Binance positioning",
    "Alternative.me Fear & Greed",
    ...(yields.length ? ["DeFi Llama yields"] : []),
    ...(snapshot.headlines.length ? ["Market wire headlines"] : []),
    ...(general.sources.length ? ["General knowledge (news/wiki)"] : []),
    ...(process.env.GEMINI_API_KEY ? ["Concierge Alpha synthesis (Gemini)"] : ["Rule-based desk fallback"]),
  ];

  return {
    ok: true,
    kind,
    dataAsOf: fetchedAt,
    sources,
    context: message || null,
    filters: {
      chain: body.chain ?? null,
      limit,
      includeInsider,
      ...(kind === "intel-momentum"
        ? { theme: momentumTheme ?? "general", themeHint: "Set theme:\"robinhood\" for RH Chain meme desk" }
        : {}),
    },
    methodology: {
      priority: ["insider", "institutional", "onchain", "narrative", "kol"],
      disclaimer:
        "This information is a summary from live desk data and public sources compiled to the best of our ability. Trading carries significant risk. Use this as part of your research & Do Your Own Research. Not Financial Advice. Lounge insider signals are creator content; verify independently.",
    },
    summary: synthesized.summary,
    candidates: synthesized.candidates,
    supporting: {
      insiderCount: insiderItems.length,
      fearGreed: sentiment,
      positioning: snapshot.positioning,
      matchedHeadlines,
      topYields: yields.slice(0, 4),
    },
  };
}
