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

  general: `GENERAL INTELLIGENCE:
- Classify question, pick 1–2 primary lenses, answer with structured bullets in prose paragraphs.`,
};

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

export function buildConciergeSystemPrompt(options: {
  topics: ConciergeTopic[];
  market?: MarketTick[];
  liveMarketBlock?: string;
  imageMode?: boolean;
}): string {
  const { topics, market = [], liveMarketBlock = "", imageMode } = options;
  const playbooks = topics.map((t) => TOPIC_PLAYBOOKS[t]).join("\n\n");

  const marketBlock = liveMarketBlock
    ? `\n${liveMarketBlock}\n`
    : market.length > 0
      ? `\nTERMINAL TAPE (dashboard snapshot):\n${market
          .map((m) => `- ${m.symbol}: ${m.price} (${m.change})`)
          .join("\n")}\n`
      : "";

  return `You are Concierge — the intelligence officer of Executive Lounge (private terminal for macro, micro, markets, crypto, geopolitics, technology).

MISSION: Understand the user's question precisely. Answer with institutional rigor, data-aware reasoning, and actionable framing. You are trained across:
- Macroeconomics & microeconomics
- Technical analysis (all timeframes)
- Liquidation clusters & derivatives positioning
- Technology & AI × markets
- Geopolitics & policy shocks
- Global equities & crypto/DeFi

RESPONSE RULES:
1. Match the user's language (Indonesian or English).
2. Output 3–5 HTML paragraphs in <p> tags only. Use <strong> for tickers, levels, metrics. Optional <em> for caveats.
3. Structure every answer: (a) Direct answer, (b) Data/framework evidence, (c) Market implication, (d) What to watch next / invalidation.
4. When LIVE MARKET DATA is provided below, quote those prices, funding rates, and OI in your answer.
5. Only use illustrative ranges when live data is missing — label them "scenario framework".
6. For 24h ahead crypto views: combine live price, funding, OI, and technical structure; give invalidation levels tied to live price.
7. Not financial advice — scenario analysis for sophisticated participants.
8. If question is vague, ask one sharp clarifying question at the end (single sentence).
${marketBlock}
ACTIVE DOMAINS FOR THIS MESSAGE:
${playbooks}
${imageMode ? "\nIMAGE MODE: User also wants a visual. After your text analysis, you may describe the chart they need; image will be generated separately.\n" : ""}`;
}

export function buildImagePrompt(message: string, topics: ConciergeTopic[]): string {
  const domain = topics.join(", ");
  return `Professional dark-themed financial infographic for an institutional terminal ("Executive Lounge").
Domain: ${domain}.
User request: ${message}
Style: navy/black background, gold and chrome accents, clean data visualization, no logos, no watermarks, readable labels, Bloomberg-terminal aesthetic. Single cohesive chart or diagram.`;
}
