export type ConciergeTopic =
  | "macro"
  | "micro"
  | "technical"
  | "liquidation"
  | "technology"
  | "geopolitics"
  | "equities"
  | "crypto"
  | "defi"
  | "strategy"
  | "general";

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
  equities: [
    "equity",
    "equities",
    "stock",
    "saham",
    "spx",
    "s&p",
    "nasdaq",
    "nyse",
    "earnings",
    "pe ratio",
    "sector rotation",
    "index",
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
  general: [],
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

  equities: `GLOBAL EQUITIES PLAYBOOK:
- Sector/style factor lens: growth vs value, large vs small, regional rotation.
- Connect SPX/Nasdaq trend to VIX, earnings revision breadth, buyback impulse.
- Cross-asset: equities vs crypto correlation regime (risk-on/off).`,

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

  general: `GENERAL INTELLIGENCE:
- Classify question, pick 1–2 primary lenses, answer with structured bullets in prose paragraphs.`,
};

/** Core trading-plan methodology — applied when user asks for trades or analysis implies actionable setup */
const TRADING_PLAN_FRAMEWORK = `TRADING PLAN INTELLIGENCE (embed when user asks for direction, outlook, levels, or explicit trading plan):

When the question is market-related OR topics include technical/crypto/liquidation/strategy, append a dedicated block titled "Trading plan" in the user's language.

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

const RESPONSE_STRUCTURE = `RESPONSE STRUCTURE (every market answer):
1. <p>Executive summary — direct answer in 2–3 sentences.</p>
2. <p>Evidence — cite live data (prices, funding, OI, Fear & Greed, DeFi TVL, headlines from CoinDesk/Bloomberg/Reuters when relevant).</p>
3. <p>Implications — what it means for positioning and next 24–72h regime.</p>
4. <p>Trading plan block — use TRADING PLAN format above (required for strategy/technical/crypto/liquidation topics, or when user asks price direction).</p>
5. <p>Optional: one clarifying question if timeframe or asset unclear.</p>`;

export function detectTopics(message: string): ConciergeTopic[] {
  const t = message.toLowerCase();
  const hits: ConciergeTopic[] = [];
  for (const topic of Object.keys(TOPIC_KEYWORDS) as ConciergeTopic[]) {
    if (topic === "general") continue;
    if (TOPIC_KEYWORDS[topic].some((kw) => t.includes(kw))) hits.push(topic);
  }
  return hits.length ? [...new Set(hits)].slice(0, 3) : ["general"];
}

export function wantsImage(message: string): boolean {
  const t = message.toLowerCase();
  return /\b(gambar|grafik|chart visual|generate image|buat gambar|infographic|heatmap visual|plot|sketch|diagram|illustrate|visualize)\b/.test(
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
  ];
  return topics.some((x) => planTopics.includes(x));
}

export function buildConciergeSystemPrompt(options: {
  topics: ConciergeTopic[];
  market?: MarketTick[];
  liveMarketBlock?: string;
  imageMode?: boolean;
  requireTradingPlan?: boolean;
}): string {
  const { topics, market = [], liveMarketBlock = "", imageMode, requireTradingPlan } = options;
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

MISSION: Precise answers + institutional analysis + concrete trading plans when markets are discussed.

CORE COMPETENCIES:
- Macroeconomics & microeconomics → regime and cross-asset implications
- Technical analysis (all timeframes) → levels, momentum, structure
- Liquidation clusters & derivatives → funding, OI, positioning skew
- Trading plan design → entry, stop, targets, R:R, size, catalysts
- Geopolitics, global equities, crypto/DeFi, technology themes

${RESPONSE_STRUCTURE}

RULES:
1. Match the user's language (Indonesian or English).
2. HTML only: <p> tags; use <strong> for tickers/prices; <em> for risk disclaimers; <br/> inside a <p> for trading-plan lines.
3. MULTI-SOURCE MARKET INTELLIGENCE below is authoritative — cite figures with source names; anchor levels to Binance mark ± structure.
4. Never invent prices outside live feed. Ranges only when data missing (label "scenario").
5. Trading plans are illustrative frameworks, not personalized financial advice.
6. Think step-by-step internally: regime → positioning → levels → plan → risks.
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
