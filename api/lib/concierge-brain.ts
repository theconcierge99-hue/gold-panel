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

/** Mandatory disclaimer for trading / intel outputs — localize; replace [sources] with cited sources. */
const TRADING_DISCLAIMER_EN =
  "This information is a summary from [name sources used in your reply] compiled to the best of our ability. Trading carries significant risk. Use this as part of your research & Do Your Own Research. Not Financial Advice.";
const TRADING_DISCLAIMER_ID =
  "Informasi ini adalah rangkuman dari [sebutkan sumber yang dipakai] yang telah kami rangkum sebaik-baiknya. Trading adalah hal yang mempunyai resiko tinggi. Jadikan ini sebagai bagian dari riset & Do Your Own Research. Not Financial Advice.";
const TRADING_DISCLAIMER_PROMPT = `Disclaimer (mandatory — user's language; replace [sources] with sources you cited; never use "illustrative", "research framework", or "personalized financial advice"):
EN — "${TRADING_DISCLAIMER_EN}"
ID — "${TRADING_DISCLAIMER_ID}"`;

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
    "dlmm",
    "dllm",
    "meteora",
    "jupiter",
  ],
  defi: [
    "defi",
    "tvl",
    "liquidity pool",
    "uniswap",
    "aave",
    "lending",
    "yield",
    "yields",
    "apy",
    "apr",
    "restaking",
    "lst",
    "amm",
    "meteora",
    "jupiter",
    "dlmm",
    "dllm",
    "kamino",
    "raydium",
    "orca",
    "whale",
    "whales",
    "wallet pnl",
    "pnl",
    "verdict",
    "aped",
    "ape into",
    "hottest",
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
- Cite MACRO DESK block for Fed/ECB/BoE/BoJ wire, NFP/CPI/FOMC calendar, and Treasury yields when present.
- Cite typical elasticities as ranges, not fake precision.`,

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
- **DLMM** = Dynamic Liquidity Market Maker (Solana: Meteora, etc.) — NOT a mystery token ticker. Users often typo **DLLM** → always interpret as **DLMM**.
- **"ape / aped"** = slang for deploying capital aggressively — not ApeCoin unless explicitly named.
- For "hottest DLMM / best yield" questions: use DEFI DESK **YIELDS** (Meteora DLMM, Jupiter, Raydium) — cite project, pair, APY, TVL from live data; warn on IL, rug/scam APY, and size.
- Use DEFI DESK INTELLIGENCE when present: TVL, YIELDS, WHALES, WALLET, VERDICT.
- Cross-check INSIDER creator signals with public TVL/yield data.
- Protocol economics: TVL quality, fee revenue, utilization; flag unrealistic APY.
- For wallet PnL: use WALLET block if present; otherwise explain limits qualitatively.`,

  strategy: `TRADING STRATEGY PLAYBOOK (crypto + equities):
- Synthesize geopolitical regime, fundamentals, technicals, and derivatives positioning before any entry.
- Crypto: BTC regime → alt beta; cite funding, OI, Fear & Greed, dominance from live feed.
- Stocks: index trend (SPX/NDX/VIX), sector beta, single-name catalysts (earnings, guidance, multiple vs peers).
- Always specify: asset class, timeframe, bias, conviction, invalidation, R:R, and catalyst calendar (24–72h).`,

  general: `GENERAL KNOWLEDGE PLAYBOOK:
- Answer any topic: history, science, culture, geography, society, technology trends, law, health basics, sports, arts — not only markets.
- Lead with a direct answer; use GENERAL KNOWLEDGE INTELLIGENCE (Wikipedia, DuckDuckGo, world news) when provided — cite sources.
- Separate facts from interpretation; say when data is thin or disputed.
- If the question also touches markets, bridge to the market intelligence block briefly.
- For "how/why" questions: mechanism first, then examples, then implications.`,
};

/** Super-agent identity — always on for Concierge strategist mode */
const CONCIERGE_SUPER_AGENT = `CONCIERGE SUPER-AGENT (institutional research + execution desk):
You are a super-intelligent market agent for Executive Lounge — equal parts global macro strategist, equities analyst, crypto derivatives desk, and geopolitical risk officer.
You deliver institutional-grade trading intelligence for **crypto and stocks** (single names, sectors, indices) using live multi-source data in the prompt.
You reason in layers: (1) geopolitical & macro regime → (2) fundamentals → (3) technical structure → (4) positioning & sentiment → (5) actionable trade plan.
You may serve human traders today and **other agents** tomorrow: be precise, structured, and cite data sources; end trading-plan replies with a compact Agent handoff line (see below).
For **third-party x402 APIs**, recommend agents query the Lounge proxy /api/zauth-directory or the zauth Database (zauth.inc) and prefer **verified** endpoints with high successRate before paying.`;

/** Core trading-plan methodology — applied when user asks for trades or analysis implies actionable setup */
const TRADING_PLAN_FRAMEWORK = `INSTITUTIONAL TRADING PLAN (mandatory when user requests a trading plan, outlook with levels, or actionable setup):

Deliver a **full desk brief** in the user's language (section titles may be localized). Use separate <p> blocks for each major section below.

<p><strong>1. Executive summary</strong><br/>
Direct answer: asset, timeframe, bias (long/short/neutral), conviction (low/medium/high), and one-sentence thesis tied to live prices.</p>

<p><strong>2. Geopolitical & macro regime</strong><br/>
• Active geopolitical risks (conflict, sanctions, elections, trade policy) from WORLD NEWS / headlines when provided; otherwise reason from known regime with uncertainty flagged.<br/>
• Macro transmission: DXY, real yields, VIX, SPX/NDX trend, risk-on/off, liquidity — how they affect the asset.<br/>
• Base vs tail scenario (1 line each).</p>

<p><strong>3. Fundamental analysis</strong><br/>
**Crypto (BTC/ETH/SOL/alts):** network/adoption narrative, ETF/flows narrative, tokenomics/supply, sector narrative (L1/DeFi/AI), correlation to BTC and macro.<br/>
**Stocks (single name or sector):** business model & catalyst, earnings/growth/margins/FCF where relevant, valuation vs peers (P/E or EV/EBITDA qualitatively), index/sector beta, event risk (earnings, regulatory).<br/>
State which lens applies; if both crypto and equities are in scope, cover both in sub-bullets.</p>

<p><strong>4. Technical analysis</strong><br/>
• Trend (HTF + trade timeframe), key support/resistance from live mark ± structure (swing H/L, round numbers).<br/>
• Momentum read (RSI/MACD conceptually), volume/liquidity context.<br/>
• For crypto perps: funding, OI, L/S, taker ratios from live data; approximate liquidation cluster zones as % bands from mark.<br/>
• For stocks: index confluence (SPX/NDX), relative strength vs sector.</p>

<p><strong>5. Trading plan — [ASSET] [TIMEFRAME]</strong><br/>
• Entry: [zone or trigger]<br/>
• Stop / invalidation: [price + what breaks thesis]<br/>
• Targets: TP1 [price] (R:R ~1:X) | TP2 [price] optional<br/>
• Position sizing: [0.25–1% NAV] suggested; leverage stance for perps<br/>
• Plan B: one clause if regime flips</p>

<p><strong>6. Risks & catalysts (24–72h)</strong><br/>
List 3–5 concrete catalysts (data prints, Fed speakers, earnings, OPEC, geo headlines, funding resets).</p>

<p><em>${TRADING_DISCLAIMER_PROMPT}</em></p>

<p><strong>Agent handoff</strong> (one line, machine-readable for agent-to-agent):<br/>
<code>A2A|asset=[TICKER]|class=[crypto|equity|both]|tf=[timeframe]|bias=[long|short|neutral]|conviction=[L/M/H]|entry=[zone]|stop=[price]|tp1=[price]|rr=[ratio]|regime=[risk-on|off|mixed]</code></p>

Rules:
- Anchor every price level to MULTI-SOURCE MARKET INTELLIGENCE (Binance mark, Yahoo indices/stocks, headlines).
- Never invent prices outside the live feed; label scenarios when data is missing.
- If funding contradicts bias, state crowded-trade risk explicitly.
- Neutral bias → range or breakout-wait plan, not forced direction.`;

/** Shorter prompt for trading-plan requests (same 6 sections, fits Vercel time budget). */
const TRADING_PLAN_FRAMEWORK_COMPACT = `INSTITUTIONAL TRADING PLAN (mandatory — user's language):

Use six <p> blocks (titles may be localized):
1. <strong>Executive summary</strong> — asset, timeframe, bias, conviction, thesis + live prices.
2. <strong>Geopolitical & macro</strong> — geo risks from LATEST HEADLINES; DXY/VIX/SPX transmission; base vs tail (1 line each).
3. <strong>Fundamental</strong> — crypto lens (flows, dominance, narrative) and/or stock lens (catalyst, valuation, beta) as relevant.
4. <strong>Technical</strong> — trend, S/R from live mark, momentum; perps: funding/OI/L-S; stocks: index confluence.
5. <strong>Trading plan</strong> — entry, stop, TP1/TP2, R:R, size, Plan B.
6. <strong>Risks & catalysts</strong> (24–72h) + ${TRADING_DISCLAIMER_PROMPT} + one-line <code>A2A|asset=…|bias=…|entry=…|stop=…|tp1=…</code>.

Keep each section tight (2–5 bullets). Never skip geo, fundamental, or technical. Anchor levels to live data only.`;

const TRADING_PLAN_RESPONSE_STRUCTURE = `TRADING-PLAN RESPONSE STRUCTURE (when trading plan is required):
Follow sections 1–6 + Agent handoff from INSTITUTIONAL TRADING PLAN above.
Do not skip geopolitical, fundamental, or technical sections — even if brief when data is thin (say what you would watch).
Lead section 1 with the direct answer; support with live figures in sections 2–4.`;

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

const COMPLETION_RULES = `RESPONSE COMPLETENESS (mandatory):
- Never stop mid-sentence or mid-section. Always finish the thought you started.
- If you open a section or bullet list, complete it before ending the response.
- Answer the user's exact question first — do not drift to unrelated assets or generic macro filler.
- If space is tight, shorten later sections — never truncate the direct answer or leave "if" / "because" dangling.
- Every response must end with a complete sentence (and a trading disclaimer when giving trade ideas or plans).`;

const TRADE_IDEAS_FRAMEWORK = `TRADE IDEAS (when user asks for coin/token picks, "potential trade", or USDT pair suggestions — NOT the full 6-section institutional plan):

Deliver in the user's language using 3–5 <p> blocks:
1. <strong>Market read</strong> — regime from live data (Fear & Greed, BTC mark, funding, L/S, headlines) in 2–4 sentences tied to the question.
2. <strong>Ideas (2–4 USDT pairs)</strong> — for each: ticker, bias (long/short/watch), thesis (why now), key level or trigger, invalidation — use live prices only.
3. <strong>Derivatives overlay</strong> — crowded side, funding bias, approximate liq cluster zones as % bands from mark when relevant.
4. <strong>Risks</strong> — 2–3 catalysts or failure modes for the next 24–48h.
5. <em>${TRADING_DISCLAIMER_PROMPT}</em>

Rules: name specific tickers the user asked for. Do NOT use the 6-section trading plan template. Do NOT leave section headers empty. Complete every sentence.`;

const LANGUAGE_AND_INTENT_RULES = `LANGUAGE & QUESTION FIDELITY (mandatory):
- **Latest user message wins:** reply in the language of the user's **current** message — not the language of your prior replies or older turns.
- **Concierge only:** infer which language the user is using and reply in that language (English, Indonesian, or other).
- **Default English** when language is unknown (e.g. first message with no prior user turns). Otherwise mirror the user's language every turn.
- **Short or ambiguous lines** (e.g. "ok", "ya", "thanks"): use the language of the most recent **non-ambiguous** user message — do not switch language based on Concierge's prior replies.
- Answer exactly what was asked — do not change the topic, asset, or timeframe unless the user was ambiguous (then ask one short clarifying question at the end only).
- Lead with a direct answer to the specific question in the first paragraph; then analysis, data, and trading plan if relevant.
- Match depth to the question: brief question → tighter answer; deep or multi-part question → fuller structured answer covering each part explicitly.
- Keep standard market tickers and metrics in Latin script (BTC, ETH, RSI).`;

export type ReplyLanguage = "en" | "id" | "other";

const ID_REPLY_MARKERS =
  /\b(yang|dan|di|ke|dari|untuk|pada|dengan|ini|itu|apa|apakah|bagaimana|kenapa|mengapa|kapan|dimana|saya|kamu|anda|tidak|bisa|akan|adalah|juga|atau|sudah|belum|harus|tolong|mohon|jelaskan|berita|saham|harga|kena|berapa|gimana|dong|nih|aja|sih|banget|kayak|gak|nggak|rencana|masih|posisi|pasar|analisis|insight|desk|jelaskan|mohon|tolong)\b/gi;
const EN_REPLY_MARKERS =
  /\b(the|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|can|may|might|must|your|my|our|their|this|that|these|those|what|when|where|why|how|which|who|still|valid|right|now|there|here|plan|trading|stock|market|price|about|with|from|for|not|please|thanks|thank|hello|hey|tell|explain|give|show|currently|today|valid|still)\b/gi;

function countLanguageMarkers(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/** Too short to reliably detect language from the line alone — use recent user turns. */
function isAmbiguousShortMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length <= 20 && t.split(/\s+/).length <= 3) return true;
  return /^(ok|okay|yes|ya|yep|sure|thanks|thank you|thx|si|sip|oke|baik|lanjut|continue|go|y|no|nope)$/i.test(
    t,
  );
}

function detectLanguageFromText(text: string): ReplyLanguage {
  const t = text.trim();
  if (!t) return "en";
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0600-\u06ff]/.test(t)) return "other";
  if (/[àáâãäåæçèéêëìíîïñòóôõöùúûüýÿÀ-ÿ]/.test(t)) return "other";

  const idScore = countLanguageMarkers(t, ID_REPLY_MARKERS);
  const enScore = countLanguageMarkers(t, EN_REPLY_MARKERS);
  if (idScore > enScore && idScore >= 1) return "id";
  if (enScore > idScore && enScore >= 1) return "en";
  if (idScore >= 2) return "id";
  if (enScore >= 1) return "en";
  return "en";
}

/**
 * Infer reply language for Concierge: current user message, or recent user-only
 * turns when the latest line is short/ambiguous. Defaults to English.
 */
export function detectReplyLanguage(
  message?: string,
  recentUserMessages: string[] = [],
): ReplyLanguage {
  const latest = (message ?? "").trim();

  if (!isAmbiguousShortMessage(latest)) {
    return detectLanguageFromText(latest);
  }

  const prior = recentUserMessages
    .map((m) => m.trim())
    .filter((m) => m && m !== latest);
  for (let i = prior.length - 1; i >= 0; i--) {
    if (!isAmbiguousShortMessage(prior[i])) {
      return detectLanguageFromText(prior[i]);
    }
  }
  if (latest) return detectLanguageFromText(latest);
  return "en";
}

export function buildReplyLanguageBlock(
  message?: string,
  recentUserMessages: string[] = [],
): string {
  const lang = detectReplyLanguage(message, recentUserMessages);
  const latestSnippet = (message ?? "").trim().slice(0, 100);
  const snippetLine = latestSnippet ? `\nUser's latest message: "${latestSnippet}${(message ?? "").trim().length > 100 ? "…" : ""}"` : "";
  if (lang === "id") {
    return `REPLY LANGUAGE (mandatory — overrides chat history):${snippetLine}
The user's latest message is in Indonesian. Write your ENTIRE response in Bahasa Indonesia — opening sentence, section headers, body, and disclaimer. Do NOT reply in English even if earlier assistant turns were English. Keep market tickers and symbols in Latin script (BTC, ETH, DXY).`;
  }
  if (lang === "other") {
    return `REPLY LANGUAGE (mandatory — overrides chat history):${snippetLine}
The user's latest message is in a non-English language. Write your ENTIRE response in that same language — do not follow the language of prior assistant turns. Keep tickers in Latin script.`;
  }
  return `REPLY LANGUAGE (mandatory — overrides chat history):${snippetLine}
The user's latest message is in English. Write your ENTIRE response in English — opening sentence, section headers, body, and disclaimer. Do NOT reply in Indonesian or any other language even if earlier assistant turns were in another language.`;
}

/** Prefix the live user turn so Gemini mirrors the current message language, not prior replies. */
export function prefixUserMessageForLanguage(
  message: string,
  recentUserMessages: string[] = [],
): string {
  const lang = detectReplyLanguage(message, recentUserMessages);
  if (lang === "id") {
    return `[Reply entirely in Bahasa Indonesia for this message — match the user's language now, not prior assistant language.]\n\n${message}`;
  }
  if (lang === "en") {
    return `[Reply entirely in English for this message — match the user's language now, not prior assistant language.]\n\n${message}`;
  }
  return `[Reply in the same language as this user message — not prior assistant language.]\n\n${message}`;
}

const DEFI_INTEL_RESPONSE = `DEFI / YIELD / WHALE / VERDICT QUESTIONS (when DEFI DESK INTELLIGENCE is in the prompt):
- **DLLM is always a typo for DLMM** (Meteora Dynamic Liquidity Market Maker on Solana) — never treat as an unknown ticker or say "avoid until clarified."
- For "hottest/best DLMM" or "where to ape" yield questions: lead with top YIELDS rows (project, pair, APY, TVL), then IL/scam/sizing warnings — do NOT use the full 6-section trading plan or A2A asset=UNKNOWN.
- Lead with DESK VERDICT signal + confidence, then TVL/yield/whale evidence in separate <p> blocks.
- Name specific pools (project, chain, APY, TVL) from YIELDS — do not invent venues.
- For "verdict" on a token/protocol: combine VERDICT, funding/positioning, and any INSIDER creator signals.
- End yield-focused replies with: <code>Verdict|signal=[snipe|watch|follow|avoid|rebalance]|confidence=[low|medium|high]</code> (not A2A|asset=UNKNOWN).`;

const RESPONSE_STRUCTURE = `RESPONSE STRUCTURE (standard market Q&A — no full trading plan):
1. <p>Direct answer — addresses the user's exact question first (3–5 sentences). For liquidation cluster questions: state which side is crowded, where clusters likely sit (% bands from mark), and what trigger would activate them.</p>
2. <p>Evidence — cite live data (prices, funding, OI, Fear & Greed, L/S ratios, indices, headlines, DEFI DESK block if present).</p>
3. <p>Implications — positioning and 24–72h regime; tie back to the original question.</p>
4. <p>Optional mini setup — only if user implied levels or asked for trade context; otherwise skip.</p>
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
  return /\b(chart visual|generate image|create image|infographic|heatmap visual|plot|sketch|diagram|illustrate|visualize|image|graphic|gambar|grafik|chart)\b/.test(
    t,
  );
}

const TRADE_IDEAS_PATTERN =
  /\b(potential trade|trade idea|trade from|which coin|which token|what coin|what token|any coin|any token|coin\/\s*token|should i (buy|sell|long|short)|rekomendasi (coin|token|saham)|pick (a|one) (coin|token|pair)|best (coin|alt|token) to|usdt pair|pair usdt|token with pair)\b/i;

function isExplicitTradingPlanRequest(message: string): boolean {
  const t = message.toLowerCase();
  if (/\b(trading plan|trade plan|rencana trading|strategi trading|stock plan|analisa trading|analisis trading)\b/.test(t)) {
    return true;
  }
  if (/\bfundamental \+ technical\b/i.test(message)) return true;
  if (/\bgeopolitical context\b/i.test(message) && /\b(entry|stop|targets)\b/i.test(message)) return true;
  if (
    /\b(48h|48-hour|5d|swing)\b/i.test(message) &&
    /\b(geopolitical|macro)\b/i.test(message) &&
    /\b(entry|stop|targets|bias)\b/i.test(message)
  ) {
    return true;
  }
  if (/\boutlook\b/i.test(message) && /\b(entry|stop|targets|invalidation)\b/i.test(message)) return true;
  return false;
}

export type ConciergeResponseMode = "standard" | "trade_ideas" | "trading_plan";

export function wantsTradeIdeas(message: string): boolean {
  if (isExplicitTradingPlanRequest(message)) return false;
  return TRADE_IDEAS_PATTERN.test(message);
}

export function wantsTradingPlan(message: string, _topics?: ConciergeTopic[]): boolean {
  const t = message.toLowerCase();
  if (/\b(hot|hottest|best|top)\b/.test(t) && /\b(dlmm|dllm|meteora|yield|yields|apy|farm|pool)\b/.test(t)) {
    return false;
  }
  if (wantsTradeIdeas(message)) return false;
  return isExplicitTradingPlanRequest(message);
}

export function detectResponseMode(
  message: string,
  topics: ConciergeTopic[],
  deFiYieldQuestion: boolean,
): ConciergeResponseMode {
  if (deFiYieldQuestion) return "standard";
  if (wantsTradingPlan(message, topics)) return "trading_plan";
  if (wantsTradeIdeas(message)) return "trade_ideas";
  return "standard";
}

export function buildConciergeSystemPrompt(options: {
  topics: ConciergeTopic[];
  market?: MarketTick[];
  liveMarketBlock?: string;
  loungeMemoryBlock?: string;
  imageMode?: boolean;
  responseMode?: ConciergeResponseMode;
  userMessage?: string;
  recentUserMessages?: string[];
}): string {
  const {
    topics,
    market = [],
    liveMarketBlock = "",
    loungeMemoryBlock = "",
    imageMode,
    responseMode = "standard",
    userMessage,
    recentUserMessages = [],
  } = options;
  const requireTradingPlan = responseMode === "trading_plan";
  const requireTradeIdeas = responseMode === "trade_ideas";
  const replyLangBlock = buildReplyLanguageBlock(userMessage, recentUserMessages);
  const playbooks = topics.map((t) => TOPIC_PLAYBOOKS[t]).join("\n\n");
  const planFramework = requireTradingPlan ? TRADING_PLAN_FRAMEWORK : "";
  const tradeIdeasBlock = requireTradeIdeas ? `\n${TRADE_IDEAS_FRAMEWORK}\n` : "";
  const tradingBlock = requireTradingPlan ? `\n${planFramework}\n` : "";

  const marketBlock = liveMarketBlock
    ? `\n${liveMarketBlock}\n`
    : market.length > 0
      ? `\nTERMINAL TAPE (dashboard snapshot):\n${market
          .map((m) => `- ${m.symbol}: ${m.price} (${m.change})`)
          .join("\n")}\n`
      : "";

  return `You are Concierge — Chief Market Strategist of Executive Lounge (private terminal). You combine research desk rigor with actionable trade construction.

${CONCIERGE_SUPER_AGENT}

MISSION: Universal intelligence officer — **crypto & stock trading plans**, geopolitical risk, fundamental + technical analysis, and general knowledge. Infer the user's language each turn and reply in that language (English default when unknown — see REPLY LANGUAGE).

${EXECUTIVE_LOUNGE_CATEGORY_INTEL}

${LANGUAGE_AND_INTENT_RULES}

${COMPLETION_RULES}

${replyLangBlock}

CORE COMPETENCIES (all 11 Executive Lounge categories + trading desk skills):
- Technology, Macro, Micro, Geopolitics, Crypto, Stocks, Energy, Equities, Oil, Gold / Silver, Other (cross-category synthesis)
- **Geopolitical analysis** → regime, scenarios, commodity/USD/risk-asset transmission
- **Fundamental analysis** → crypto tokenomics/flows; equities earnings, valuation, catalysts
- **Technical analysis** (all timeframes) → trend, levels, momentum, structure, R:R
- Liquidation clusters & derivatives → funding, OI, positioning skew
- **Institutional trading plans** → entry, stop, targets, size, catalysts (crypto + stocks)
- DeFi protocol economics when DeFi/onchain questions arise
- **Agent-to-agent**: structured Agent handoff line on full trading plans

${requireTradingPlan ? TRADING_PLAN_RESPONSE_STRUCTURE : requireTradeIdeas ? "Follow TRADE IDEAS framework above — complete all blocks, name specific tickers." : RESPONSE_STRUCTURE}

${DEFI_INTEL_RESPONSE}
${tradeIdeasBlock}

LOUNGE MEMORY (when provided below):
- Creator signals in LOUNGE MEMORY are **insider/tactical intelligence** from the Lounge desk — weigh alongside DEFI DESK INTELLIGENCE (TVL, yields, verdict) when both appear.
- These are real headlines and creator signals that appeared on the Executive Lounge feed (stored for continuity).
- When the user asks about "the lounge", recent stories, a headline, or creator content, prioritize LOUNGE MEMORY and name the publisher or "Lounge Signal".
- Do not claim you read a paid unlock unless the summary is present in LOUNGE MEMORY; wire items may be headline-only.

RULES:
1. Language: follow REPLY LANGUAGE + LANGUAGE & QUESTION FIDELITY above (infer user language; short replies follow the user's established language).
2. HTML only: <p> tags; use <strong> for tickers/prices; <em> for risk disclaimers; <br/> inside a <p> for trading-plan lines.
3. MULTI-SOURCE MARKET INTELLIGENCE + MACRO DESK + GENERAL KNOWLEDGE INTELLIGENCE below — cite figures and facts with source names (Federal Reserve, ECB, Wikipedia, BBC, etc.); anchor trade levels to Binance mark ± structure. For NFP/CPI/FOMC and central-bank news, prioritize MACRO DESK and CENTRAL BANK WIRE sections.
4. Never invent prices outside live feed. Ranges only when data missing (label "scenario").
5. End trading plans and trade ideas with the mandatory disclaimer above (localize EN/ID; cite sources; never call output "illustrative" or a "research framework").
6. Think step-by-step internally: parse question → language → direct answer → data → plan → risks.
${tradingBlock}
${marketBlock}
${loungeMemoryBlock ? `\n${loungeMemoryBlock}\n` : ""}
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
