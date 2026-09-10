/**
 * Trenches / degen token research — DexScreener + Pump + RugCheck + meta/whale scoring.
 * Solana-first; other chains use DexScreener with thinner safety/whale layers.
 */
const FETCH_MS = 6_500;
const CACHE_TTL_MS = 60_000;

/** Desk chain keys — DexScreener slug unless noted. */
export type TrenchesChain =
  | "solana"
  | "base"
  | "ethereum"
  | "bsc"
  | "arbitrum"
  | "robinhood"
  | "mars"
  | "monad"
  | "abstract"
  | "avalanche"
  | "polygon"
  | "optimism"
  | "blast"
  | "sui"
  | "ton"
  | "worldchain"
  | "unichain"
  | "berachain";

const TRENCHES_CHAINS = new Set<string>([
  "solana",
  "base",
  "ethereum",
  "bsc",
  "arbitrum",
  "robinhood",
  "mars",
  "monad",
  "abstract",
  "avalanche",
  "polygon",
  "optimism",
  "blast",
  "sui",
  "ton",
  "worldchain",
  "unichain",
  "berachain",
]);

/** DexScreener chainId slug (may differ from UI key). */
const DEX_CHAIN_SLUG: Record<TrenchesChain, string> = {
  solana: "solana",
  base: "base",
  ethereum: "ethereum",
  bsc: "bsc",
  arbitrum: "arbitrum",
  robinhood: "robinhood",
  mars: "mars",
  monad: "monad",
  abstract: "abstract",
  avalanche: "avalanche",
  polygon: "polygon",
  optimism: "optimism",
  blast: "blast",
  sui: "sui",
  ton: "ton",
  worldchain: "worldchain",
  unichain: "unichain",
  berachain: "berachain",
};

/** GMGN path segment when supported; null = skip deep link. */
const GMGN_CHAIN_PATH: Partial<Record<TrenchesChain, string>> = {
  solana: "sol",
  ethereum: "eth",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  avalanche: "avax",
  polygon: "polygon",
  optimism: "optimism",
  blast: "blast",
  sui: "sui",
  ton: "ton",
  monad: "monad",
};
export type UpsideBand = "early" | "mid" | "late" | "unknown";

export type TrenchesScores = {
  narrativeFit: number;
  metaHeat: number;
  ctSupport: number;
  whaleSupport: number;
  safety: number;
  earlyUpside: number;
  composite: number;
};

export type SafetyCheck = {
  id: string;
  label: string;
  ok: boolean | null;
  detail: string;
};

export type WhaleHit = {
  label: string;
  wallet: string;
  pct?: number | null;
  note: string;
};

export type TrenchesTokenBrief = {
  address: string;
  chain: TrenchesChain;
  symbol: string;
  name: string;
  priceUsd: number | null;
  mcapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  pairAgeHours: number | null;
  dexId: string | null;
  pairUrl: string | null;
};

export type TrenchesVerdict = {
  ok: true;
  kind: "intel-trenches";
  mode: "full" | "lite";
  dataAsOf: string;
  sources: string[];
  chain: TrenchesChain;
  address: string;
  token: TrenchesTokenBrief;
  scores: TrenchesScores;
  upsideBand: UpsideBand;
  deskPick: boolean;
  hardFails: string[];
  meta: { tags: string[]; heatNote: string };
  ct: { summary: string; links: { label: string; url: string }[] };
  whales: WhaleHit[];
  safety: { score: number; checks: SafetyCheck[] };
  launchpad: {
    source: string | null;
    bondingProgress: number | null;
    graduated: boolean | null;
    note: string;
  };
  links: {
    dexscreener: string | null;
    pump: string | null;
    gmgn: string | null;
    xSearch: string | null;
  };
  disclaimer: string;
};

export type TrenchesScreenRow = {
  address: string;
  chain: TrenchesChain;
  symbol: string;
  name: string;
  mcapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  pairAgeHours: number | null;
  metaTags: string[];
  safetyPreview: number | null;
  upsideBand: UpsideBand;
  deskPick: boolean;
  pairUrl: string | null;
  compositePreview: number | null;
};

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number; h6?: number; h1?: number };
  pairCreatedAt?: number;
  info?: {
    socials?: { type?: string; url?: string }[];
    websites?: { url?: string }[];
  };
  boosts?: { active?: number };
};

type CacheEntry<T> = { at: number; value: T };
const verdictCache = new Map<string, CacheEntry<TrenchesVerdict>>();
const screenCache = new Map<string, CacheEntry<TrenchesScreenRow[]>>();

/** Curated Solana smart-money labels (expandable). */
const SOL_SMART_MONEY: { wallet: string; label: string }[] = [
  { wallet: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", label: "Raydium authority" },
  { wallet: "FWXgqE3LmgSSWZR4bZtJGbNqFWnZFU5zqQqeqWZnF1iQ", label: "Known sniper cluster" },
  { wallet: "GThUX1Atko4tqfNTdgpxG6v8Ycwp4AUaWvhTt9sGpQmF", label: "High-volume desk" },
];

const META_LEXICON: { tag: string; patterns: RegExp[] }[] = [
  { tag: "ai", patterns: [/\bai\b/i, /gpt/i, /agent/i, /llm/i, /neural/i] },
  { tag: "animal", patterns: [/dog/i, /cat/i, /pepe/i, /frog/i, /monkey/i, /wolf/i, /bear/i] },
  { tag: "celebrity", patterns: [/trump/i, /elon/i, /musk/i, /modi/i, /celebrity/i] },
  { tag: "politics", patterns: [/maga/i, /vote/i, /election/i, /president/i] },
  { tag: "meme", patterns: [/meme/i, /coin/i, /degen/i, /trench/i, /pump/i] },
  { tag: "gaming", patterns: [/game/i, /play/i, /pixel/i, /rpg/i] },
  { tag: "rwa", patterns: [/\brwa\b/i, /treasury/i, /gold/i, /real.?world/i] },
  { tag: "solana", patterns: [/solana/i, /\bsol\b/i, /pump\.?fun/i] },
  { tag: "robinhood", patterns: [/robinhood/i, /hoodchain/i, /cashcat/i] },
  { tag: "mars", patterns: [/\bmars\b/i, /marschain/i] },
];

const HOT_META_PRIORITY = [
  "ai",
  "animal",
  "celebrity",
  "politics",
  "meme",
  "gaming",
  "rwa",
  "solana",
  "robinhood",
  "mars",
];

const DISCLAIMER =
  "Desk scores are research heuristics — not financial advice. Safety ≠ rug-free guarantee. Upside bands describe stage (early/mid/late), not promised multiples.";

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fmtAgeHours(createdAtMs: number | undefined): number | null {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return null;
  return Math.max(0, (Date.now() - createdAtMs) / 3_600_000);
}

function normalizeChain(raw: string | undefined | null): TrenchesChain {
  const c = String(raw ?? "solana").trim().toLowerCase();
  if (c === "eth" || c === "ethereum" || c === "mainnet") return "ethereum";
  if (c === "bsc" || c === "bnb" || c === "binance") return "bsc";
  if (c === "arb" || c === "arbitrum") return "arbitrum";
  if (c === "rh" || c === "robinhood" || c === "hoodchain" || c === "robinhoodchain") {
    return "robinhood";
  }
  if (c === "mars" || c === "marschain" || c === "mars-chain") return "mars";
  if (c === "avax" || c === "avalanche") return "avalanche";
  if (c === "matic" || c === "polygon" || c === "pol") return "polygon";
  if (c === "op" || c === "optimism") return "optimism";
  if (c === "world" || c === "worldchain") return "worldchain";
  if (c === "uni" || c === "unichain") return "unichain";
  if (c === "bera" || c === "berachain") return "berachain";
  if (TRENCHES_CHAINS.has(c)) return c as TrenchesChain;
  return "solana";
}

function dexChainId(chain: TrenchesChain): string {
  return DEX_CHAIN_SLUG[chain] ?? chain;
}

function gmgnPath(chain: TrenchesChain): string | null {
  return GMGN_CHAIN_PATH[chain] ?? null;
}

function screenQueriesFor(chain: TrenchesChain): string[] {
  const slug = dexChainId(chain);
  switch (chain) {
    case "solana":
      return ["pump", "sol meme", "ai sol"];
    case "base":
      return ["base meme", "base ai"];
    case "robinhood":
      return ["robinhood meme", "cashcat", "robinhood ai"];
    case "mars":
      return ["mars meme", "marschain"];
    case "monad":
      return ["monad meme", "monad ai"];
    case "abstract":
      return ["abstract meme", "abstract chain"];
    default:
      return [`${slug} meme`, `${slug} ai`];
  }
}

function extractAddress(raw: string): string {
  return String(raw ?? "").trim();
}

function detectMetaTags(symbol: string, name: string): string[] {
  const blob = `${symbol} ${name}`;
  const tags: string[] = [];
  for (const row of META_LEXICON) {
    if (row.patterns.some((re) => re.test(blob))) tags.push(row.tag);
  }
  if (!tags.length) tags.push("meme");
  return tags;
}

function upsideBandFrom(mcap: number | null, ageH: number | null): UpsideBand {
  if (mcap == null && ageH == null) return "unknown";
  const m = mcap ?? 1e12;
  const a = ageH ?? 999;
  if (m < 150_000 && a < 48) return "early";
  if (m < 1_500_000 && a < 168) return "mid";
  if (m < 8_000_000) return "mid";
  return "late";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ConciergeTrenches/1.0" },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchDexPairsForToken(address: string): Promise<DexPair[]> {
  const data = await fetchJson<{ pairs?: DexPair[] }>(
    `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
  );
  return data?.pairs ?? [];
}

function pickBestPair(pairs: DexPair[], chain: TrenchesChain): DexPair | null {
  const want = dexChainId(chain);
  const filtered = pairs.filter((p) => (p.chainId ?? "").toLowerCase() === want);
  const pool = filtered.length ? filtered : pairs;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

function briefFromPair(pair: DexPair, address: string, chain: TrenchesChain): TrenchesTokenBrief {
  const base = pair.baseToken?.address?.toLowerCase() === address.toLowerCase()
    ? pair.baseToken
    : pair.quoteToken?.address?.toLowerCase() === address.toLowerCase()
      ? pair.quoteToken
      : pair.baseToken;
  const price = pair.priceUsd != null ? Number(pair.priceUsd) : null;
  const mcap = pair.marketCap ?? pair.fdv ?? null;
  return {
    address,
    chain,
    symbol: base?.symbol ?? "—",
    name: base?.name ?? "Unknown",
    priceUsd: Number.isFinite(price) ? price : null,
    mcapUsd: mcap != null && Number.isFinite(mcap) ? mcap : null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
    pairAgeHours: fmtAgeHours(pair.pairCreatedAt),
    dexId: pair.dexId ?? null,
    pairUrl: pair.url ?? null,
  };
}

type PumpCoin = {
  mint?: string;
  name?: string;
  symbol?: string;
  description?: string;
  market_cap?: number;
  usd_market_cap?: number;
  complete?: boolean;
  bonding_curve?: string;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  created_timestamp?: number;
  twitter?: string;
  telegram?: string;
  website?: string;
  king_of_the_hill_timestamp?: number | null;
};

async function fetchPumpCoin(mint: string): Promise<PumpCoin | null> {
  const urls = [
    `https://frontend-api.pump.fun/coins/${encodeURIComponent(mint)}`,
    `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}`,
  ];
  for (const url of urls) {
    const data = await fetchJson<PumpCoin>(url);
    if (data?.mint || data?.symbol) return data;
  }
  return null;
}

type RugReport = {
  score?: number;
  score_normalised?: number;
  rugged?: boolean;
  risks?: { name?: string; level?: string; description?: string }[];
  tokenMeta?: { name?: string; symbol?: string };
  topHolders?: { address?: string; pct?: number; owner?: string }[];
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  markets?: { lp?: { locked?: boolean; lpLockedPct?: number } }[];
};

async function fetchRugCheck(mint: string): Promise<RugReport | null> {
  return fetchJson<RugReport>(
    `https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report`,
  );
}

function bondingProgress(pump: PumpCoin | null): number | null {
  if (!pump) return null;
  if (pump.complete) return 100;
  const vSol = pump.virtual_sol_reserves;
  if (vSol == null || !Number.isFinite(vSol)) return null;
  // Rough: ~85 SOL virtual ≈ near graduation on classic curve
  return clampScore((vSol / 85) * 100);
}

function buildSafety(
  chain: TrenchesChain,
  rug: RugReport | null,
  token: TrenchesTokenBrief,
): { score: number; checks: SafetyCheck[]; hardFails: string[] } {
  const checks: SafetyCheck[] = [];
  const hardFails: string[] = [];

  if (chain !== "solana") {
    checks.push({
      id: "chain_coverage",
      label: "Safety coverage",
      ok: null,
      detail:
        chain === "robinhood"
          ? "Robinhood Chain — DexScreener pairs; RugCheck is Solana-only (provisional safety)."
          : chain === "mars"
            ? "Mars Chain — Dex coverage may be thin; treat safety as provisional until indexed."
            : "Full RugCheck coverage is Solana-first; treat non-Solana safety as provisional.",
    });
  }

  if (rug) {
    const rugged = rug.rugged === true;
    checks.push({
      id: "rugged_flag",
      label: "RugCheck rugged flag",
      ok: !rugged,
      detail: rugged ? "Marked rugged by RugCheck" : "Not marked rugged",
    });
    if (rugged) hardFails.push("rugged");

    const mintAuth = rug.mintAuthority;
    const mintOk = mintAuth == null || mintAuth === "" || mintAuth === "null";
    checks.push({
      id: "mint_authority",
      label: "Mint authority",
      ok: mintOk,
      detail: mintOk ? "Mint revoked / null" : `Mint authority live: ${String(mintAuth).slice(0, 12)}…`,
    });
    if (!mintOk) hardFails.push("mint_authority");

    const freezeAuth = rug.freezeAuthority;
    const freezeOk = freezeAuth == null || freezeAuth === "" || freezeAuth === "null";
    checks.push({
      id: "freeze_authority",
      label: "Freeze authority",
      ok: freezeOk,
      detail: freezeOk ? "Freeze revoked / null" : "Freeze authority still set",
    });
    if (!freezeOk) hardFails.push("freeze_authority");

    const top = rug.topHolders ?? [];
    const top1 = top[0]?.pct ?? null;
    const top10 = top.slice(0, 10).reduce((s, h) => s + (h.pct ?? 0), 0);
    const concOk = top10 < 45;
    checks.push({
      id: "holder_concentration",
      label: "Top-10 holder share",
      ok: top.length ? concOk : null,
      detail: top.length
        ? `Top1 ${top1 != null ? top1.toFixed(1) : "—"}% · Top10 ${top10.toFixed(1)}%`
        : "Holder histogram unavailable",
    });
    if (top.length && top10 >= 60) hardFails.push("extreme_concentration");

    const lpLocked = rug.markets?.some((m) => m.lp?.locked || (m.lp?.lpLockedPct ?? 0) >= 80) ?? null;
    checks.push({
      id: "lp_lock",
      label: "LP lock signal",
      ok: lpLocked,
      detail:
        lpLocked === true
          ? "LP lock / burned signal present"
          : lpLocked === false
            ? "No strong LP lock signal"
            : "LP lock data thin",
    });

    const riskHigh = (rug.risks ?? []).filter((r) =>
      /danger|critical|high/i.test(String(r.level ?? r.name ?? "")),
    );
    checks.push({
      id: "risk_flags",
      label: "RugCheck risk flags",
      ok: riskHigh.length === 0,
      detail: riskHigh.length
        ? riskHigh.map((r) => r.name ?? r.level).filter(Boolean).slice(0, 4).join(", ")
        : "No high/critical risk names surfaced",
    });
    if (riskHigh.length >= 2) hardFails.push("multiple_high_risks");
  } else {
    checks.push({
      id: "rugcheck",
      label: "RugCheck report",
      ok: null,
      detail: chain === "solana" ? "Report unavailable — score discounted" : "Not queried for this chain",
    });
  }

  const liq = token.liquidityUsd;
  checks.push({
    id: "liquidity",
    label: "Liquidity floor",
    ok: liq == null ? null : liq >= 8_000,
    detail: liq == null ? "Unknown liquidity" : `$${Math.round(liq).toLocaleString()} USD`,
  });
  if (liq != null && liq < 2_000) hardFails.push("dust_liquidity");

  let score = 55;
  if (rug?.score_normalised != null) score = rug.score_normalised;
  else if (rug?.score != null) score = rug.score > 10 ? rug.score : rug.score * 10;
  for (const c of checks) {
    if (c.ok === true) score += 4;
    if (c.ok === false) score -= 8;
  }
  for (const _ of hardFails) score -= 12;
  return { score: clampScore(score), checks, hardFails: [...new Set(hardFails)] };
}

function scoreMetaHeat(tags: string[], token: TrenchesTokenBrief, boosts: number): number {
  let s = 35;
  const priorityHits = tags.filter((t) => HOT_META_PRIORITY.includes(t)).length;
  s += priorityHits * 10;
  const vol = token.volume24hUsd ?? 0;
  const liq = token.liquidityUsd ?? 1;
  if (vol > 50_000) s += 12;
  if (vol > 250_000) s += 10;
  if (liq > 0 && vol / liq > 2) s += 10;
  if (boosts > 0) s += Math.min(15, boosts * 3);
  const age = token.pairAgeHours;
  if (age != null && age < 24) s += 8;
  if (age != null && age < 6) s += 6;
  return clampScore(s);
}

function scoreNarrativeFit(tags: string[], metaHeat: number): number {
  const hot = tags.some((t) => ["ai", "animal", "celebrity", "politics"].includes(t));
  let s = hot ? 62 : 45;
  s += Math.round(metaHeat * 0.25);
  if (tags.includes("meme") && tags.length === 1) s -= 8;
  return clampScore(s);
}

function scoreCt(
  pair: DexPair | null,
  pump: PumpCoin | null,
): { score: number; summary: string; links: { label: string; url: string }[] } {
  const links: { label: string; url: string }[] = [];
  let s = 28;
  const socials = pair?.info?.socials ?? [];
  for (const soc of socials) {
    if (!soc.url) continue;
    const type = String(soc.type ?? "social");
    links.push({ label: type, url: soc.url });
    if (/twitter|x/i.test(type) || /x\.com|twitter\.com/i.test(soc.url)) s += 18;
    else s += 8;
  }
  if (pump?.twitter) {
    links.push({ label: "twitter", url: pump.twitter });
    s += 16;
  }
  if (pump?.telegram) {
    links.push({ label: "telegram", url: pump.telegram });
    s += 8;
  }
  if (pump?.website) {
    links.push({ label: "website", url: pump.website });
    s += 4;
  }
  const uniq = new Map(links.map((l) => [l.url, l]));
  const deduped = [...uniq.values()];
  const summary = deduped.length
    ? `CT/social surfaces found (${deduped.length}). Cross-check KOL quality on X / GMGN.`
    : "No verified social links on Dex/Pump — CT support is speculative; use X search deep link.";
  if (!deduped.length) s = 22;
  return { score: clampScore(s), summary, links: deduped.slice(0, 6) };
}

function scoreWhales(rug: RugReport | null, chain: TrenchesChain): { score: number; hits: WhaleHit[] } {
  const hits: WhaleHit[] = [];
  if (chain !== "solana" || !rug?.topHolders?.length) {
    return {
      score: 30,
      hits: [
        {
          label: "Coverage",
          wallet: "—",
          note:
            chain === "solana"
              ? "Top-holder graph unavailable"
              : "Whale labels are Solana-first in v1",
        },
      ],
    };
  }
  let s = 35;
  const holders = rug.topHolders.slice(0, 20);
  for (const h of holders) {
    const addr = h.address ?? h.owner ?? "";
    if (!addr) continue;
    const known = SOL_SMART_MONEY.find((w) => w.wallet === addr);
    if (known) {
      hits.push({
        label: known.label,
        wallet: addr,
        pct: h.pct ?? null,
        note: "Matched curated smart-money watchlist",
      });
      s += 18;
    }
  }
  const large = holders.filter((h) => (h.pct ?? 0) >= 2 && (h.pct ?? 0) < 12);
  if (large.length >= 2) {
    s += 10;
    hits.push({
      label: "Sized holders",
      wallet: large[0]?.address ?? "—",
      pct: large[0]?.pct ?? null,
      note: `${large.length} mid-size holders (2–12%) — distribution not single-wallet`,
    });
  }
  const top1 = holders[0]?.pct ?? 0;
  if (top1 > 25) s -= 20;
  if (!hits.length) {
    hits.push({
      label: "No labeled whale",
      wallet: holders[0]?.address ?? "—",
      pct: holders[0]?.pct ?? null,
      note: "No curated smart-money match in top holders",
    });
  }
  return { score: clampScore(s), hits: hits.slice(0, 6) };
}

function scoreEarlyUpside(token: TrenchesTokenBrief, bonding: number | null): number {
  let s = 40;
  const m = token.mcapUsd;
  const age = token.pairAgeHours;
  if (m != null) {
    if (m < 50_000) s += 35;
    else if (m < 200_000) s += 28;
    else if (m < 1_000_000) s += 16;
    else if (m < 5_000_000) s += 4;
    else s -= 20;
  }
  if (age != null) {
    if (age < 6) s += 18;
    else if (age < 24) s += 12;
    else if (age < 72) s += 6;
    else if (age > 720) s -= 15;
  }
  if (bonding != null && bonding < 90) s += 8;
  if (bonding != null && bonding >= 100) s -= 5;
  const liq = token.liquidityUsd ?? 0;
  if (liq > 0 && m != null && m / Math.max(liq, 1) > 40) s -= 10;
  return clampScore(s);
}

function compositeScores(parts: Omit<TrenchesScores, "composite">): TrenchesScores {
  const composite = clampScore(
    parts.safety * 0.28 +
      parts.earlyUpside * 0.18 +
      parts.metaHeat * 0.18 +
      parts.narrativeFit * 0.14 +
      parts.whaleSupport * 0.12 +
      parts.ctSupport * 0.1,
  );
  return { ...parts, composite };
}

function buildLinks(
  chain: TrenchesChain,
  address: string,
  symbol: string,
  pairUrl: string | null,
): TrenchesVerdict["links"] {
  const chainPath = dexChainId(chain);
  const gmgn = gmgnPath(chain);
  return {
    dexscreener: pairUrl ?? `https://dexscreener.com/${chainPath}/${address}`,
    pump: chain === "solana" ? `https://pump.fun/coin/${address}` : null,
    gmgn: gmgn ? `https://gmgn.ai/${gmgn}/token/${address}` : null,
    xSearch: `https://x.com/search?q=${encodeURIComponent(`$${symbol} OR ${address}`)}&f=live`,
  };
}

function toLite(v: TrenchesVerdict): TrenchesVerdict {
  return {
    ...v,
    mode: "lite",
    whales: v.whales.slice(0, 2),
    safety: { score: v.safety.score, checks: v.safety.checks.slice(0, 4) },
    ct: { summary: v.ct.summary, links: v.ct.links.slice(0, 2) },
  };
}

export async function runTrenchesIntel(options: {
  address: string;
  chain?: string;
  mode?: "full" | "lite";
}): Promise<TrenchesVerdict> {
  const address = extractAddress(options.address);
  if (!address || address.length < 8) {
    throw new Error("Token address required (mint / CA)");
  }
  const chain = normalizeChain(options.chain);
  const mode = options.mode === "lite" ? "lite" : "full";
  const cacheKey = `${chain}:${address}:${mode}`;
  const cached = verdictCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const sources: string[] = [];
  const pairs = await fetchDexPairsForToken(address);
  const pair = pickBestPair(pairs, chain);
  if (pair) sources.push("DexScreener");

  let pump: PumpCoin | null = null;
  if (chain === "solana") {
    pump = await fetchPumpCoin(address);
    if (pump) sources.push("Pump.fun");
  }

  let token: TrenchesTokenBrief | null = pair ? briefFromPair(pair, address, chain) : null;
  if (!token && pump) {
    const mcap = pump.usd_market_cap ?? pump.market_cap ?? null;
    const ageH =
      pump.created_timestamp != null
        ? Math.max(0, (Date.now() - pump.created_timestamp) / 3_600_000)
        : null;
    token = {
      address,
      chain,
      symbol: pump.symbol ?? "—",
      name: pump.name ?? "Unknown",
      priceUsd: null,
      mcapUsd: mcap != null && Number.isFinite(mcap) ? mcap : null,
      liquidityUsd: null,
      volume24hUsd: null,
      pairAgeHours: ageH,
      dexId: "pumpfun",
      pairUrl: `https://pump.fun/coin/${address}`,
    };
  }
  if (!token) {
    throw new Error("No DexScreener pair or Pump.fun coin found for address on requested chain");
  }

  let rug: RugReport | null = null;
  if (chain === "solana") {
    rug = await fetchRugCheck(address);
    if (rug) sources.push("RugCheck");
  }

  const tags = detectMetaTags(token.symbol, token.name);
  const bonding = bondingProgress(pump);
  const safety = buildSafety(chain, rug, token);
  const metaHeat = scoreMetaHeat(tags, token, pair?.boosts?.active ?? 0);
  const narrativeFit = scoreNarrativeFit(tags, metaHeat);
  const ct = scoreCt(pair, pump);
  const whales = scoreWhales(rug, chain);
  const earlyUpside = scoreEarlyUpside(token, bonding);
  const scores = compositeScores({
    narrativeFit,
    metaHeat,
    ctSupport: ct.score,
    whaleSupport: whales.score,
    safety: safety.score,
    earlyUpside,
  });

  const band = upsideBandFrom(token.mcapUsd, token.pairAgeHours);
  const deskPick =
    safety.hardFails.length === 0 &&
    safety.score >= 55 &&
    scores.composite >= 55 &&
    (band === "early" || band === "mid");

  const heatNote =
    metaHeat >= 70
      ? "Meta velocity elevated — volume/age/boost confluence"
      : metaHeat >= 45
        ? "Moderate meta heat — watch for CT confirmation"
        : "Quiet meta — needs narrative catalyst";

  let verdict: TrenchesVerdict = {
    ok: true,
    kind: "intel-trenches",
    mode: "full",
    dataAsOf: new Date().toISOString(),
    sources: sources.length ? sources : ["heuristic"],
    chain,
    address,
    token,
    scores,
    upsideBand: band,
    deskPick,
    hardFails: safety.hardFails,
    meta: { tags, heatNote },
    ct: { summary: ct.summary, links: ct.links },
    whales: whales.hits,
    safety: { score: safety.score, checks: safety.checks },
    launchpad: {
      source: pump ? "pump.fun" : pair?.dexId?.includes("pump") ? "pump-dex" : null,
      bondingProgress: bonding,
      graduated: pump?.complete ?? null,
      note: pump
        ? pump.complete
          ? "Graduated / complete on Pump"
          : `Bonding ~${bonding ?? "—"}% (heuristic)`
        : "Launchpad status unknown — pair may be post-grad or non-Pump",
    },
    links: buildLinks(chain, address, token.symbol, token.pairUrl),
    disclaimer: DISCLAIMER,
  };

  if (mode === "lite") verdict = toLite(verdict);
  verdictCache.set(cacheKey, { at: Date.now(), value: verdict });
  return verdict;
}

function rowFromPair(pair: DexPair, chain: TrenchesChain): TrenchesScreenRow | null {
  const address = pair.baseToken?.address;
  if (!address) return null;
  const token = briefFromPair(pair, address, chain);
  const tags = detectMetaTags(token.symbol, token.name);
  const band = upsideBandFrom(token.mcapUsd, token.pairAgeHours);
  const m = token.mcapUsd ?? Infinity;
  const age = token.pairAgeHours ?? Infinity;
  if (m > 5_000_000) return null;
  if (age > 240) return null;
  const vol = token.volume24hUsd ?? 0;
  if (vol < 5_000 && (token.liquidityUsd ?? 0) < 5_000) return null;

  const metaHeat = scoreMetaHeat(tags, token, pair.boosts?.active ?? 0);
  const early = scoreEarlyUpside(token, null);
  const compositePreview = clampScore(metaHeat * 0.45 + early * 0.55);
  const deskPick = band === "early" && compositePreview >= 55 && (token.liquidityUsd ?? 0) >= 5_000;

  return {
    address,
    chain,
    symbol: token.symbol,
    name: token.name,
    mcapUsd: token.mcapUsd,
    liquidityUsd: token.liquidityUsd,
    volume24hUsd: token.volume24hUsd,
    pairAgeHours: token.pairAgeHours,
    metaTags: tags,
    safetyPreview: null,
    upsideBand: band,
    deskPick,
    pairUrl: token.pairUrl,
    compositePreview,
  };
}

export async function runTrenchesScreen(options?: {
  chain?: string;
  limit?: number;
  maxMcapUsd?: number;
  meta?: string;
}): Promise<{
  ok: true;
  kind: "intel-trenches-screen";
  dataAsOf: string;
  sources: string[];
  filters: {
    chain: TrenchesChain;
    limit: number;
    maxMcapUsd: number;
    meta: string | null;
  };
  candidates: TrenchesScreenRow[];
  disclaimer: string;
}> {
  const chain = normalizeChain(options?.chain);
  const limit = Math.max(1, Math.min(24, options?.limit ?? 12));
  const maxMcap = options?.maxMcapUsd ?? 2_000_000;
  const metaFilter = options?.meta?.trim().toLowerCase() || null;
  const cacheKey = `screen:${chain}:${limit}:${maxMcap}:${metaFilter ?? ""}`;
  const cached = screenCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return {
      ok: true,
      kind: "intel-trenches-screen",
      dataAsOf: new Date().toISOString(),
      sources: ["DexScreener"],
      filters: { chain, limit, maxMcapUsd: maxMcap, meta: metaFilter },
      candidates: cached.value,
      disclaimer: DISCLAIMER,
    };
  }

  const queries = screenQueriesFor(chain);
  const pairMap = new Map<string, DexPair>();
  for (const q of queries) {
    const data = await fetchJson<{ pairs?: DexPair[] }>(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
    );
    for (const p of data?.pairs ?? []) {
      if ((p.chainId ?? "").toLowerCase() !== dexChainId(chain)) continue;
      const addr = p.baseToken?.address;
      if (!addr) continue;
      const prev = pairMap.get(addr);
      if (!prev || (p.volume?.h24 ?? 0) > (prev.volume?.h24 ?? 0)) pairMap.set(addr, p);
    }
  }

  let rows = [...pairMap.values()]
    .map((p) => rowFromPair(p, chain))
    .filter((r): r is TrenchesScreenRow => !!r)
    .filter((r) => (r.mcapUsd ?? Infinity) <= maxMcap);

  if (metaFilter) {
    rows = rows.filter((r) => r.metaTags.some((t) => t.includes(metaFilter) || metaFilter.includes(t)));
  }

  rows.sort((a, b) => (b.compositePreview ?? 0) - (a.compositePreview ?? 0));
  const candidates = rows.slice(0, limit);
  screenCache.set(cacheKey, { at: Date.now(), value: candidates });

  return {
    ok: true,
    kind: "intel-trenches-screen",
    dataAsOf: new Date().toISOString(),
    sources: ["DexScreener"],
    filters: { chain, limit, maxMcapUsd: maxMcap, meta: metaFilter },
    candidates,
    disclaimer: DISCLAIMER,
  };
}
