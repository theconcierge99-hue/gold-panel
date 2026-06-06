/** Concierge Agent — paid x402 + MPP endpoint catalog (mirrors api/lib/x402-discovery.ts). */
export const CONCIERGE_AGENT_ORIGIN =
  typeof location !== "undefined" && location.origin ? location.origin : "https://conc-exe.xyz";

export const CONCIERGE_AGENT_SEGMENTS = [
  { id: "all", label: "All" },
  { id: "concierge", label: "Concierge" },
  { id: "intel", label: "DeFi Intel" },
  { id: "alpha", label: "Alpha Intel" },
  { id: "lounge", label: "Lounge" },
];

/** @type {readonly { id: string; segment: string; method: string; path: string; name: string; description: string; priceUsd: string; sampleBody?: object }[]} */
export const CONCIERGE_AGENT_ENDPOINTS = [
  {
    id: "concierge",
    segment: "concierge",
    method: "POST",
    path: "/api/concierge",
    name: "Concierge chat",
    description: "One Gemini turn — macro, geo, technicals, DeFi desk, trading plans (HTML reply).",
    priceUsd: "0.10",
    sampleBody: {
      mode: "chat",
      message: "Hottest Meteora DLMM pools — IL risks?",
      history: [],
      market: [],
    },
  },
  {
    id: "intel-tvl",
    segment: "intel",
    method: "POST",
    path: "/api/concierge-intel-tvl",
    name: "Intel — TVL",
    description: "Chain TVL snapshot and top DeFi protocols (DeFi Llama).",
    priceUsd: "0.10",
    sampleBody: {},
  },
  {
    id: "intel-yields",
    segment: "intel",
    method: "POST",
    path: "/api/concierge-intel-yields",
    name: "Intel — Yields",
    description: "Screened pools — Meteora DLMM API, Jupiter, Raydium, major venues.",
    priceUsd: "0.10",
    sampleBody: { chain: "solana", project: "meteora" },
  },
  {
    id: "intel-whales",
    segment: "intel",
    method: "POST",
    path: "/api/concierge-intel-whales",
    name: "Intel — Whales",
    description: "BTC/ETH/SOL top-trader long/short ratios (Binance derivatives proxy).",
    priceUsd: "0.10",
    sampleBody: { symbols: ["BTC", "ETH", "SOL"] },
  },
  {
    id: "intel-wallet",
    segment: "intel",
    method: "POST",
    path: "/api/concierge-intel-wallet",
    name: "Intel — Wallet",
    description: "Solana wallet snapshot (Helius) or EVM address acknowledgment.",
    priceUsd: "0.10",
    sampleBody: { message: "Paste a Solana or EVM address in solAddress / evmAddress" },
  },
  {
    id: "intel-verdict",
    segment: "intel",
    method: "POST",
    path: "/api/concierge-intel-verdict",
    name: "Intel — Verdict",
    description: "Desk verdict: snipe/watch/follow/avoid/rebalance + insider creator signals.",
    priceUsd: "0.10",
    sampleBody: { message: "DeFi outlook on Solana", includeInsider: true },
  },
  {
    id: "intel-airdrop",
    segment: "alpha",
    method: "POST",
    path: "/api/concierge-intel-airdrop",
    name: "Intel — Airdrop",
    description: "Potential airdrop candidates — Lounge insider first, then institutional/onchain/narrative/KOL.",
    priceUsd: "0.10",
    sampleBody: { message: "Solana ecosystem points farming", limit: 5, includeInsider: true },
  },
  {
    id: "intel-listing",
    segment: "alpha",
    method: "POST",
    path: "/api/concierge-intel-listing",
    name: "Intel — Listing",
    description: "Potential exchange listing candidates — insider-first alpha desk synthesis.",
    priceUsd: "0.10",
    sampleBody: { message: "Binance listing rumors", limit: 5 },
  },
  {
    id: "intel-momentum",
    segment: "alpha",
    method: "POST",
    path: "/api/concierge-intel-momentum",
    name: "Intel — Momentum",
    description: "Large-move candidates (up or down) — insider + positioning + narrative.",
    priceUsd: "0.10",
    sampleBody: { message: "Altcoins volatility catalysts", limit: 5, includeInsider: true },
  },
  {
    id: "news-open",
    segment: "lounge",
    method: "POST",
    path: "/api/news-open",
    name: "Open wire article",
    description: "Unlock one headline and receive the canonical article URL.",
    priceUsd: "0.10",
    sampleBody: {
      url: "https://example.com/article",
      title: "Headline title",
      source: "Reuters",
    },
  },
  {
    id: "signal-publish",
    segment: "lounge",
    method: "POST",
    path: "/api/lounge-signal-publish",
    name: "Publish creator signal",
    description: "Publish RWA intelligence signal to the Lounge feed (anti-spam fee).",
    priceUsd: "1.00",
    sampleBody: { title: "Signal title", summary: "Full intelligence summary…", category: "Crypto" },
  },
  {
    id: "signal-open",
    segment: "lounge",
    method: "POST",
    path: "/api/lounge-signal-open",
    name: "Unlock creator signal",
    description: "Unlock full summary for one Lounge RWA creator signal.",
    priceUsd: "0.10",
    sampleBody: { signalId: "sig_…" },
  },
];

export function endpointUrl(path) {
  return `${CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "")}${path}`;
}

export function countBySegment() {
  const total = CONCIERGE_AGENT_ENDPOINTS.length;
  const intel = CONCIERGE_AGENT_ENDPOINTS.filter((e) => e.segment === "intel").length;
  const alpha = CONCIERGE_AGENT_ENDPOINTS.filter((e) => e.segment === "alpha").length;
  const lounge = CONCIERGE_AGENT_ENDPOINTS.filter((e) => e.segment === "lounge").length;
  const concierge = CONCIERGE_AGENT_ENDPOINTS.filter((e) => e.segment === "concierge").length;
  return { total, intel, alpha, lounge, concierge };
}
