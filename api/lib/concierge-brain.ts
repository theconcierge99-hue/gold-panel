export type ConciergeTopic =
  | "macro"
  | "micro"
  | "technical"
  | "liquidation"
  | "technology"
  | "geopolitics"
  | "crypto"
  | "stocks"
  | "energy"
  | "equities"
  | "oil"
  | "precious_metals"
  | "defi"
  | "strategy"
  | "other"
  | "general";

/** Sidebar / Create Signal taxonomy — Concierge must answer any question in these lenses */
export const EXECUTIVE_LOUNGE_CATEGORIES = [
  "Technology",
  "Macro",
  "Micro",
  "Geopolitics",
  "Crypto",
  "Stocks",
  "Energy",
  "Equities",
  "Oil",
  "Gold / Silver",
  "Other",
] as const;

const LOUNGE_CATEGORY_TRIGGERS: { patterns: string[]; topics: ConciergeTopic[] }[] = [
  { patterns: ["technology", "teknologi"], topics: ["technology"] },
  { patterns: ["macro", "makro", "macroeconom"], topics: ["macro"] },
  { patterns: ["micro", "mikro", "microeconom"], topics: ["micro"] },
  { patterns: ["geopolit", "geopolitik"], topics: ["geopolitics"] },
  { patterns: ["crypto", "kripto", "cryptocurrency"], topics: ["crypto"] },
  { patterns: ["stocks", "saham", "single stock", "stock pick"], topics: ["stocks"] },
  { patterns: ["energy", "energi", "renewable", "utilities sector"], topics: ["energy"] },
  { patterns: ["equities", "ekuitas", "equity market"], topics: ["equities"] },
  { patterns: ["oil", "crude", "wti", "brent", "opec", "minyak"], topics: ["oil"] },
  {
    patterns: ["gold / silver", "gold/silver", "precious metal", "xau", "xag", "emas", "perak"],
    topics: ["precious_metals"],
  },
  { patterns: ["other category", "cross-asset", "miscellaneous", "lainnya"], topics: ["other"] },
];

export type MarketTick = { symbol: string; price: string; change: string };

const TOPIC_KEYWORDS: Record<ConciergeTopic, string[]> = {
  macro: [
    "macro",
    "fed",
    "fomc",
    "cpi",
    "inflation",
    "gdp",
    "rates",
    "yield",
    "dxy",
    "dollar",
    "treasury",
    "soft landing",
    "recession",
    "liquidity",
    "qe",
    "qt",
    "real rates",
    "ekonomi makro",
  ],
  micro: [
    "micro",
    "supply",
    "demand",
    "elasticity",
    "marginal",
    "utility",
    "firm",
    "industry structure",
    "competition",
    "pricing power",
    "ekonomi mikro",
  ],
  technical: [
    "technical",
    "teknikal",
    "support",
    "resistance",
    "rsi",
    "macd",
    "fib",
    "fibonacci",
    "moving average",
    "ma ",
    "ema",
    "bollinger",
    "breakout",
    "pattern",
    "candle",
    "volume profile",
    "vwap",
    "ichimoku",
    "chart",
    "grafik",
  ],
  liquidation: [
    "liquidation",
    "likuidasi",
    "liq cluster",
    "liquidation cluster",
    "heatmap",
    "open interest",
    "oi ",
    "funding",
    "perp",
    "leverage",
    "cascade",
    "stop hunt",
    "long squeeze",
    "short squeeze",
    "coinglass",
  ],
  technology: [
    "technology",
    "teknologi",
    "ai ",
    "artificial",
    "semiconductor",
    "chip",
    "cloud",
    "cyber",
    "software",
    "hardware",
    "innovation",
    "agent",
    "llm",
  ],
  geopolitics: [
    "geopolit",
    "geopolitik",
    "war",
    "sanction",
    "election",
    "tariff",
    "trade war",
    "nato",
    "china",
    "russia",
    "middle east",
    "conflict",
    "diplomacy",
  ],
  stocks: [
    "stocks",
    "stock",
    "saham",
    "single name",
    "stock pick",
    "earnings",
    "guidance",
    "aapl",
    "msft",
    "nvda",
    "tsla",
    "amzn",
    "goog",
    "meta",
    "mag7",
    "faang",
    "berkshire",
    "share price",
    "market cap",
    "dividend",
    "buyback",
    "insider",
    "analyst rating",
    "ipo",
  ],
  energy: [
    "energy",
    "energi",
    "power grid",
    "electricity",
    "utility",
    "utilities",
    "renewable",
    "solar",
    "wind power",
    "nuclear",
    "lng",
    "natural gas",
    "nat gas",
    "hydrogen",
    "energy transition",
    "xle",
    "uranium",
  ],
  equities: [
    "equity",
    "equities",
    "ekuitas",
    "spx",
    "s&p",
    "nasdaq",
    "nyse",
    "dow jones",
    "russell",
    "msci",
    "ftse",
    "dax",
    "nikkei",
    "hang seng",
    "sector rotation",
    "factor",
    "breadth",
    "vix",
    "index",
    "global equity",
  ],
  oil: [
    "oil",
    "crude",
    "wti",
    "brent",
    "opec",
    "opec+",
    "barrel",
    "petroleum",
    "refinery",
    "crack spread",
    "inventory eia",
    "eia report",
    "minyak",
    "usoil",
    "ukoil",
  ],
  precious_metals: [
    "gold",
    "silver",
    "xau",
    "xag",
    "precious",
    "bullion",
    "comex",
    "safe haven",
    "real yield",
    "emas",
    "perak",
    "gld",
    "slv",
    "palladium",
    "platinum",
  ],
  crypto: [
    "crypto",
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "solana",
    "sol",
    "onchain",
    "on-chain",
    "defi",
    "dex",
    "stablecoin",
    "altcoin",
    "memecoin",
  ],
  defi: [
    "defi",
    "tvl",
    "liquidity pool",
    "uniswap",
    "aave",
    "lending",
    "yield",
    "restaking",
    "lst",
    "amm",
  ],
  strategy: [
    "trading plan",
    "trade plan",
    "rencana trading",
    "strategi",
    "strategy",
    "entry",
    "exit",
    "stop loss",
    "stop-loss",
    "take profit",
    "tp ",
    "sl ",
    "target",
    "invalidation",
    "position size",
    "risk reward",
    "r:r",
    "risk/reward",
    "setup",
    "long ",
    "short ",
    "swing trade",
    "scalp",
    "breakout trade",
  ],
  other: [
    "cross-asset",
    "multi-asset",
    "portfolio",
    "allocation",
    "correlation",
    "diversification",
    "regime shift",
    "black swan",
    "tail risk",
    "hedge",
    "thematic",
    "narrative",
    "sentiment",
  ],
  general: [
    "general",
    "umum",
    "pengetahuan",
    "knowledge",
    "history",
    "sejarah",
    "science",
    "sains",
    "geography",
    "geografi",
    "who is",
    "what is",
    "apa itu",
    "siapa",
    "explain",
    "jelaskan",
    "define",
    "definisi",
    "meaning",
    "arti",
    "culture",
    "budaya",
    "politics",
    "politik",
    "health",
    "kesehatan",
    "climate",
    "iklim",
    "education",
    "pendidikan",
    "philosophy",
    "filosofi",
    "law",
    "hukum",
    "religion",
    "agama",
    "sport",
    "olahraga",
    "art",
    "seni",
    "music",
    "musik",
    "film",
    "book",
    "novel",
  ],
};

const TOPIC_PLAYBOOKS: Record<ConciergeTopic, string> = {
  macro: `MACRO PLAYBOOK:
- Frame answer in regimes: growth/inflation quadrant, policy stance (hawkish/dovish), liquidity cycle.
- Connect DXY, real yields, curve shape, and risk appetite to crypto/equities beta.
- Use transmission channels: rates → USD → EM → duration assets → BTC/ETH correlation.
- Cite typical elasticities as ranges, not fake precision. Flag if user needs live CPI/FOMC calendar.`,

  micro: `MICROECONOMICS PLAYBOOK:
- Clarify market structure: perfect competition vs oligopoly, marginal cost/revenue, consumer surplus.
- For crypto: fee markets, MEV, validator economics, LP payoff, token supply schedules.
- Separate short-run (fixed capacity) vs long-run (entry/exit) when relevant.`,

  technical: `TECHNICAL ANALYSIS PLAYBOOK:
- State timeframe explicitly (intraday / swing / position).
- Structure: trend → key levels → momentum (RSI/MACD) → volume → invalidation → targets (R:R).
- Mention confluence (HTF level + LTF trigger). Avoid certitude; use probability language.
- For crypto perps: tie levels to liquidity pools and prior swing H/L.`,

  liquidation: `LIQUIDATION CLUSTER PLAYBOOK:
- Explain mechanics: OI concentration, funding, leverage distribution, cascade triggers.
- Describe how clusters act as magnets (stop runs) then mean-reversion zones.
- Framework: identify side crowded (long/short), estimate notional at risk bands, funding bias, spot-perp basis.
- Without live Coinglass data: use scenario bands ("if BTC rejects X, long liqs cluster Y–Z") and what to watch (funding flip, OI drop).`,

  technology: `TECHNOLOGY PLAYBOOK:
- Link tech theme to market expression (semis → NVDA ecosystem, AI → compute tokens, agents → onchain automation).
- Separate hype cycle vs revenue/usage metrics. Name second-order trades (infra vs apps).`,

  geopolitics: `GEOPOLITICS PLAYBOOK:
- Map event → commodity channel → USD safe-haven → rates → risk assets.
- Scenarios: base / upside risk / tail. Impact on energy, gold, BTC as geopolitical hedge narrative.
- Avoid partisan takes; institutional neutral tone.`,

  stocks: `STOCKS PLAYBOOK (single names & sectors):
- Structure: catalyst → fundamentals (growth/margins/FCF) → valuation (P/E, EV/EBITDA vs peers) → technical context → risk.
- Separate idiosyncratic drivers (earnings, guidance, legal, product) from beta (macro, sector ETF, index trend).
- Name peer set and relative strength; flag event risk (earnings date, FDA, regulatory).
- Cross-link to Macro (rates/DXY), Technology (if tech name), Energy (if energy name), Geopolitics (if ADR/exposure).`,

  energy: `ENERGY PLAYBOOK:
- Map supply/demand: OPEC+ discipline, inventories, refining capacity, power demand, LNG flows.
- Sub-themes: oil & gas majors, utilities, renewables (solar/wind), nuclear, grid infrastructure, energy transition policy.
- Transmission: energy → CPI goods → rates → equities energy sector (XLE) → inflation breakevens → gold.
- Distinguish structural (decade) vs cyclical (quarter) drivers; cite policy (IRA, carbon, sanctions).`,

  equities: `GLOBAL EQUITIES PLAYBOOK (indices & factors):
- Sector/style factor lens: growth vs value, large vs small, regional rotation.
- Connect SPX/Nasdaq trend to VIX, earnings revision breadth, buyback impulse.
- Cross-asset: equities vs crypto correlation regime (risk-on/off).
- For index-level questions, prefer this lens; for single-ticker questions, use STOCKS playbook.`,

  oil: `OIL PLAYBOOK:
- Focus WTI/Brent, spreads, OPEC+ decisions, EIA/API inventories, refinery utilization, crack spreads.
- Geopolitical risk premium vs fundamental surplus/deficit; USD and rate sensitivity.
- Link to Energy sector equities, inflation prints, and risk-off episodes.
- Scenario framework: base / supply shock / demand shock with price bands (label scenario if no live crude feed).`,

  precious_metals: `GOLD / SILVER PLAYBOOK:
- Gold: real rates, DXY, inflation expectations, central bank demand, geopolitical hedge, BTC correlation regime.
- Silver: industrial demand (solar/electronics) plus precious-metal beta; higher volatility vs gold.
- Structure: macro drivers → positioning (ETF/COT conceptually) → key levels (XAU/XAG) → cross-asset (miners, DXY, yields).
- Avoid treating gold as only an inflation hedge — specify which driver dominates now.`,

  other: `OTHER / CROSS-CATEGORY PLAYBOOK:
- When the question is broad, unconventional, or spans desks: name 2–3 Executive Lounge categories that apply and synthesize.
- Deliver a unified insight (not a list of definitions); show transmission between categories.
- If ambiguous, state your assumed lens in one sentence, then answer fully.
- Still use live market data when the question touches tradable assets.`,

  crypto: `CRYPTO PLAYBOOK:
- Layer: macro liquidity → BTC regime → ETH/BTC → alt beta → micro (L1/L2/DeFi).
- Onchain metrics to reference conceptually: exchange flows, stablecoin supply, active addresses, fees.
- Positioning: funding, OI, ETF flows narrative where relevant.`,

  defi: `DEFI PLAYBOOK:
- Protocol economics: TVL quality, fee revenue, token accrual, utilization, bad debt risk.
- Compare AMM vs orderbook, restaking risks, stablecoin depeg vectors.`,

  strategy: `TRADING STRATEGY PLAYBOOK:
- Deliver a complete trade framework anchored to MULTI-SOURCE live prices (Binance mark, indices, headlines).
- Always specify: timeframe, bias (long/short/neutral), conviction (low/med/high).`,

  general: `GENERAL KNOWLEDGE PLAYBOOK:
- Answer any topic: history, science, culture, geography, society, technology trends, law, health basics, sports, arts — not only markets.
- Lead with a direct answer; use GENERAL KNOWLEDGE INTELLIGENCE (Wikipedia, DuckDuckGo, world news) when provided — cite sources.
- Separate facts from interpretation; say when data is thin or disputed.
- If the question also touches markets, bridge to the market intelligence block briefly.
- For "how/why" questions: mechanism first, then examples, then implications.`,
};

/** Core trading-plan methodology — applied when user asks for trades or analysis implies actionable setup */
const TRADING_PLAN_FRAMEWORK = `TRADING PLAN INTELLIGENCE (embed when user asks for direction, outlook, levels, or explicit trading plan):

When the question is market-related OR topics include technical/crypto/liquidation/strategy, append a dedicated block titled "Trading plan" (always in English).

Use this exact structure inside one or two <p> tags (use <br/> for line breaks inside a paragraph):

<strong>Trading plan — [ASSET] [TIMEFRAME]</strong><br/>
• Bias: [long / short / neutral] — conviction [low/medium/high]<br/>
• Thesis: [1 sentence linking macro/tech/positioning data]<br/>
• Entry: [zone or trigger, e.g. retest of level X or break above Y]<br/>
• Stop / invalidation: [price — what proves thesis wrong]<br/>
• Targets: TP1 [price] (R:R ~1:X) | TP2 [price] optional<br/>
• Risk: size [0.25–1% NAV illustrative] | leverage [conservative/moderate — avoid high lev if funding against you]<br/>
• Positioning context: [funding, OI, L/S ratio from live data]<br/>
• Catalysts to watch: [2–3 events or levels in next 24–72h]

Rules for plans:
- Derive entry/stop/targets as specific prices from current mark ± logical % or structure (prior swing, liq cluster zone).
- If funding positive and long bias, note crowded-long risk; if negative funding and short bias, note squeeze risk.
- Offer Plan B (alternate scenario) in one short clause if regime shifts.
- Label clearly: "illustrative framework, not financial advice."
- For neutral bias: describe range trade or wait-for-breakout plan instead of forcing direction.`;

const EXECUTIVE_LOUNGE_CATEGORY_INTEL = `EXECUTIVE LOUNGE — 11 INTELLIGENCE CATEGORIES (mandatory taxonomy):
Users may ask about ANY category below. Detect intent, apply the matching playbook(s), and combine when a question spans lenses (e.g. Geopolitics + Oil, Macro + Gold / Silver).

1. Technology — AI, semiconductors, software, cloud, cyber; market expression via tech equities and compute/crypto themes.
2. Macro — Fed, inflation, GDP, DXY, yields, liquidity, growth/inflation quadrant.
3. Micro — firm/industry economics, pricing power, supply chains; crypto microstructure (fees, MEV, validators) when relevant.
4. Geopolitics — conflict, sanctions, elections, trade policy; commodity and safe-haven channels.
5. Crypto — BTC/ETH/SOL, onchain, DeFi, derivatives positioning, ETF flows.
6. Stocks — single names, sectors, earnings, guidance, relative strength vs benchmarks.
7. Energy — oil & gas, power, renewables, utilities, LNG, energy transition (broad desk).
8. Equities — global indices, factor rotation, breadth, vol, regional markets.
9. Oil — crude (WTI/Brent), OPEC+, inventories, crack spreads (narrow desk).
10. Gold / Silver — precious metals, real rates, USD, safe-haven and industrial silver drivers.
11. Other — cross-asset synthesis, portfolio/regime questions, unconventional topics; explicitly tag which categories you used.

When the user names a category (e.g. "Energy insight", "question about Stocks"), answer as that desk's lead strategist first, then cross-asset implications.`;

const LANGUAGE_AND_INTENT_RULES = `LANGUAGE & QUESTION FIDELITY (mandatory):
- **Always reply in English** — the terminal UI is English-only. You may understand questions in any language, but every response must be written in English.
- Answer exactly what was asked — do not change the topic, asset, or timeframe unless the user was ambiguous (then ask one short clarifying question at the end only).
- Lead with a direct answer to the specific question in the first paragraph; then analysis, data, and trading plan if relevant.
- Match depth to the question: brief question → tighter answer; deep or multi-part question → fuller structured answer covering each part explicitly.
- Keep standard market tickers and metrics in Latin script (BTC, ETH, RSI).`;

export function buildReplyLanguageBlock(_message?: string): string {
  return `REPLY LANGUAGE (mandatory):
Write your ENTIRE response in English only. Do not reply in Indonesian or any other language.`;
}

const RESPONSE_STRUCTURE = `RESPONSE STRUCTURE (every market answer):
1. <p>Direct answer — addresses the user's exact question first (2–3 sentences).</p>
2. <p>Evidence — cite live data (prices, funding, OI, Fear & Greed, DeFi TVL, headlines from CoinDesk/Bloomberg/Reuters when relevant).</p>
3. <p>Implications — what it means for positioning and next 24–72h regime.</p>
4. <p>Trading plan block — use TRADING PLAN format above (required for strategy/technical/crypto/liquidation topics, or when user asks price direction).</p>
5. <p>Optional: one clarifying question only if asset, timeframe, or intent was genuinely unclear.</p>`;

function matchesCategoryPattern(text: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase();
  if (!p) return false;
  if (p.length <= 5 && !/\s/.test(p)) {
    return new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
  }
  return text.includes(p);
}

export function detectTopics(message: string): ConciergeTopic[] {
  const t = message.toLowerCase();
  const hits: ConciergeTopic[] = [];
  for (const { patterns, topics } of LOUNGE_CATEGORY_TRIGGERS) {
    if (patterns.some((p) => matchesCategoryPattern(t, p))) {
      for (const topic of topics) {
        if (!hits.includes(topic)) hits.push(topic);
      }
    }
  }
  for (const topic of Object.keys(TOPIC_KEYWORDS) as ConciergeTopic[]) {
    if (TOPIC_KEYWORDS[topic].some((kw) => t.includes(kw))) {
      if (!hits.includes(topic)) hits.push(topic);
    }
  }
  const marketTopics: ConciergeTopic[] = [
    "macro",
    "micro",
    "technical",
    "liquidation",
    "technology",
    "geopolitics",
    "equities",
    "crypto",
    "defi",
    "strategy",
    "stocks",
    "energy",
    "oil",
    "precious_metals",
    "other",
  ];
  const hasMarket = hits.some((h) => marketTopics.includes(h));
  if (!hits.length || (!hasMarket && hits.length <= 2)) {
    if (!hits.includes("general")) hits.unshift("general");
  }
  return [...new Set(hits)].slice(0, 3);
}

export function wantsImage(message: string): boolean {
  const t = message.toLowerCase();
  return /\b(chart visual|generate image|create image|infographic|heatmap visual|plot|sketch|diagram|illustrate|visualize|image|graphic)\b/.test(
    t,
  );
}

export function wantsTradingPlan(message: string, topics: ConciergeTopic[]): boolean {
  const t = message.toLowerCase();
  if (
    /\b(trading plan|trade plan|rencana trading|strategi trading|entry|stop loss|take profit|tp\/sl|setup trade|buka posisi|target harga|invalidasi)\b/.test(
      t,
    )
  ) {
    return true;
  }
  const planTopics: ConciergeTopic[] = [
    "strategy",
    "technical",
    "crypto",
    "liquidation",
    "oil",
    "precious_metals",
    "stocks",
    "energy",
  ];
  return topics.some((x) => planTopics.includes(x));
}

export function buildConciergeSystemPrompt(options: {
  topics: ConciergeTopic[];
  market?: MarketTick[];
  liveMarketBlock?: string;
  imageMode?: boolean;
  requireTradingPlan?: boolean;
  userMessage?: string;
}): string {
  const { topics, market = [], liveMarketBlock = "", imageMode, requireTradingPlan, userMessage } =
    options;
  const replyLangBlock = buildReplyLanguageBlock(userMessage);
  const playbooks = topics.map((t) => TOPIC_PLAYBOOKS[t]).join("\n\n");
  const tradingBlock = requireTradingPlan ? `\n${TRADING_PLAN_FRAMEWORK}\n` : "";

  const marketBlock = liveMarketBlock
    ? `\n${liveMarketBlock}\n`
    : market.length > 0
      ? `\nTERMINAL TAPE (dashboard snapshot):\n${market
          .map((m) => `- ${m.symbol}: ${m.price} (${m.change})`)
          .join("\n")}\n`
      : "";

  return `You are Concierge — Chief Market Strategist of Executive Lounge (private terminal). You combine research desk rigor with actionable trade construction.

MISSION: Universal intelligence officer — markets, trading plans, AND general knowledge (history, science, culture, world affairs). All replies in English.

${EXECUTIVE_LOUNGE_CATEGORY_INTEL}

${LANGUAGE_AND_INTENT_RULES}

${replyLangBlock}

CORE COMPETENCIES (all 11 Executive Lounge categories + trading desk skills):
- Technology, Macro, Micro, Geopolitics, Crypto, Stocks, Energy, Equities, Oil, Gold / Silver, Other (cross-category synthesis)
- Technical analysis (all timeframes) → levels, momentum, structure
- Liquidation clusters & derivatives → funding, OI, positioning skew
- Trading plan design → entry, stop, targets, R:R, size, catalysts
- DeFi protocol economics when DeFi/onchain questions arise

${RESPONSE_STRUCTURE}

RULES:
1. Language: follow REPLY LANGUAGE + LANGUAGE & QUESTION FIDELITY above (English only).
2. HTML only: <p> tags; use <strong> for tickers/prices; <em> for risk disclaimers; <br/> inside a <p> for trading-plan lines.
3. MULTI-SOURCE MARKET INTELLIGENCE + GENERAL KNOWLEDGE INTELLIGENCE below — cite figures and facts with source names (Wikipedia, BBC, NPR, etc.); anchor trade levels to Binance mark ± structure.
4. Never invent prices outside live feed. Ranges only when data missing (label "scenario").
5. Trading plans are illustrative frameworks, not personalized financial advice.
6. Think step-by-step internally: parse question → language → direct answer → data → plan → risks.
${tradingBlock}
${marketBlock}
ACTIVE DOMAINS:
${playbooks}
${imageMode ? "\nIMAGE MODE: Include analysis + trading plan in text; visual generated separately.\n" : ""}`;
}

export function buildImagePrompt(message: string, topics: ConciergeTopic[]): string {
  const domain = topics.join(", ");
  return `Professional dark-themed financial infographic for an institutional terminal ("Executive Lounge").
Domain: ${domain}.
User request: ${message}
Style: navy/black background, gold and chrome accents, clean data visualization, no logos, no watermarks, readable labels, Bloomberg-terminal aesthetic. Single cohesive chart or diagram.`;
}
