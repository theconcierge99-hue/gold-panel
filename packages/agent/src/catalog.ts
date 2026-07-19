/**
 * Static paid-route catalog — mirrors backend X402_DISCOVERY_RESOURCES.
 * Live OpenAPI may add fields; path/kind/price stay the stable agent contract.
 */

export type ResourceKind =
  | "news"
  | "concierge"
  | "signal-publish"
  | "signal-open"
  | "intel-tvl"
  | "intel-yields"
  | "intel-whales"
  | "intel-wallet"
  | "intel-verdict"
  | "intel-airdrop"
  | "intel-listing"
  | "intel-momentum"
  | "intel-scalp"
  | "intel-macro"
  | "intel-wire"
  | "intel-meteora"
  | "intel-desk-brief"
  | "intel-a2a-pipeline"
  | "security-readiness"
  | "security-headers"
  | "security-scan"
  | "security-deep-scan"
  | "concierge-lp"
  | "resource-chat"
  | "resource-image"
  | "resource-scaffold";

export type CatalogEntry = {
  kind: ResourceKind;
  method: "POST";
  path: string;
  name: string;
  description: string;
  priceUsd: string;
  tags: string[];
};

export const DEFAULT_ORIGIN = "https://conc-exe.xyz";

export const CATALOG: readonly CatalogEntry[] = [
  {
    kind: "news",
    method: "POST",
    path: "/api/news-open",
    name: "Open news article",
    description: "Unlock one wire headline and receive the canonical article URL.",
    priceUsd: "0.10",
    tags: ["news"],
  },
  {
    kind: "concierge",
    method: "POST",
    path: "/api/concierge",
    name: "Concierge AI message",
    description: "One Concierge AI turn (chat, enhance, or image analysis).",
    priceUsd: "0.10",
    tags: ["concierge"],
  },
  {
    kind: "signal-publish",
    method: "POST",
    path: "/api/lounge-signal-publish",
    name: "Publish creator signal",
    description: "Publish one RWA intelligence signal to the Executive Lounge feed.",
    priceUsd: "0.02",
    tags: ["lounge", "signal"],
  },
  {
    kind: "signal-open",
    method: "POST",
    path: "/api/lounge-signal-open",
    name: "Unlock creator signal",
    description: "Unlock full intelligence summary for one Lounge RWA creator signal.",
    priceUsd: "0.10",
    tags: ["lounge", "signal"],
  },
  {
    kind: "intel-tvl",
    method: "POST",
    path: "/api/concierge-intel-tvl",
    name: "Intel — TVL",
    description: "Chain TVL snapshot and top DeFi protocols (DeFi Llama).",
    priceUsd: "0.02",
    tags: ["intel", "defi"],
  },
  {
    kind: "intel-yields",
    method: "POST",
    path: "/api/concierge-intel-yields",
    name: "Intel — Yields",
    description: "Screened yield pools on Solana/EVM.",
    priceUsd: "0.10",
    tags: ["intel", "defi"],
  },
  {
    kind: "intel-whales",
    method: "POST",
    path: "/api/concierge-intel-whales",
    name: "Intel — Whales",
    description: "Binance top-trader long/short ratios (BTC/ETH/SOL).",
    priceUsd: "0.02",
    tags: ["intel", "derivatives"],
  },
  {
    kind: "intel-wallet",
    method: "POST",
    path: "/api/concierge-intel-wallet",
    name: "Intel — Wallet",
    description: "Wallet snapshot for Solana (Helius) or EVM address.",
    priceUsd: "0.10",
    tags: ["intel", "wallet"],
  },
  {
    kind: "intel-verdict",
    method: "POST",
    path: "/api/concierge-intel-verdict",
    name: "Intel — Verdict",
    description: "Structured desk verdict with Fear & Greed, positioning, yields.",
    priceUsd: "0.10",
    tags: ["intel", "desk"],
  },
  {
    kind: "intel-airdrop",
    method: "POST",
    path: "/api/concierge-intel-airdrop",
    name: "Intel — Airdrop",
    description: "Potential airdrop candidates — insider-first synthesis.",
    priceUsd: "0.10",
    tags: ["intel", "alpha"],
  },
  {
    kind: "intel-listing",
    method: "POST",
    path: "/api/concierge-intel-listing",
    name: "Intel — Listing",
    description: "Potential exchange listing candidates.",
    priceUsd: "0.10",
    tags: ["intel", "alpha"],
  },
  {
    kind: "intel-momentum",
    method: "POST",
    path: "/api/concierge-intel-momentum",
    name: "Intel — Momentum",
    description: "Large-move candidates (up or down).",
    priceUsd: "0.10",
    tags: ["intel", "alpha"],
  },
  {
    kind: "intel-scalp",
    method: "POST",
    path: "/api/concierge-intel-scalp",
    name: "Intel — Scalp",
    description: "BTC/ETH/BNB/SOL scalping desk — 5m & 15m klines.",
    priceUsd: "0.10",
    tags: ["intel", "scalp"],
  },
  {
    kind: "intel-macro",
    method: "POST",
    path: "/api/concierge-intel-macro",
    name: "Intel — Macro",
    description: "Macro snapshot — SPX, VIX, DXY, gold, BTC/ETH, Fear & Greed.",
    priceUsd: "0.02",
    tags: ["intel", "research"],
  },
  {
    kind: "intel-wire",
    method: "POST",
    path: "/api/concierge-intel-wire",
    name: "Intel — Wire",
    description: "Wire headline digest — live RSS plus Lounge feed.",
    priceUsd: "0.02",
    tags: ["intel", "research"],
  },
  {
    kind: "intel-meteora",
    method: "POST",
    path: "/api/concierge-intel-meteora",
    name: "Intel — Meteora DLMM",
    description: "Meteora DLMM pool deep-dive — TVL, APY, IL risk flags.",
    priceUsd: "0.10",
    tags: ["intel", "solana"],
  },
  {
    kind: "intel-desk-brief",
    method: "POST",
    path: "/api/concierge-intel-desk-brief",
    name: "Intel — Desk brief",
    description: "Composite brief — macro + yields + verdict + insider overlay.",
    priceUsd: "0.25",
    tags: ["intel", "bundle"],
  },
  {
    kind: "intel-a2a-pipeline",
    method: "POST",
    path: "/api/concierge-intel-a2a-pipeline",
    name: "Intel — A2A pipeline",
    description: "Desk brief plus A2A handoff and delegate routing to peer agents.",
    priceUsd: "0.25",
    tags: ["intel", "a2a", "bundle"],
  },
  {
    kind: "security-readiness",
    method: "POST",
    path: "/api/concierge-security-readiness",
    name: "Security — API readiness",
    description: "Passive agent-readiness audit for an authorized external API.",
    priceUsd: "0.02",
    tags: ["security"],
  },
  {
    kind: "security-headers",
    method: "POST",
    path: "/api/concierge-security-headers",
    name: "Security — HTTP headers",
    description: "Passive HTTP security header review for an authorized target.",
    priceUsd: "0.02",
    tags: ["security"],
  },
  {
    kind: "security-scan",
    method: "POST",
    path: "/api/concierge-security-scan",
    name: "Security — Scan bundle",
    description: "Unified passive security scan bundle.",
    priceUsd: "0.10",
    tags: ["security", "bundle"],
  },
  {
    kind: "security-deep-scan",
    method: "POST",
    path: "/api/concierge-security-deep-scan",
    name: "Security — Deep scan",
    description:
      "Authorized async deep scan job ($1). Poll GET ?jobId= for status and findings.",
    priceUsd: "1.00",
    tags: ["security", "async"],
  },
  {
    kind: "concierge-lp",
    method: "POST",
    path: "/api/concierge-lp/start",
    name: "Concierge LP — Session start",
    description:
      "Start a wallet-signed Concierge LP session ($0.25). Poll /api/concierge-lp/status; stop via /api/concierge-lp/stop.",
    priceUsd: "0.25",
    tags: ["defi", "dlmm", "meteora", "session"],
  },
  {
    kind: "resource-chat",
    method: "POST",
    path: "/api/resource-chat",
    name: "Resource — Chat",
    description: "Concierge Resources creative chat endpoint.",
    priceUsd: "0.05",
    tags: ["resources"],
  },
  {
    kind: "resource-image",
    method: "POST",
    path: "/api/resource-image",
    name: "Resource — Image",
    description: "Concierge Resources image generation endpoint.",
    priceUsd: "0.10",
    tags: ["resources"],
  },
  {
    kind: "resource-scaffold",
    method: "POST",
    path: "/api/resource-scaffold",
    name: "Resource — Scaffold",
    description: "Concierge Resources scaffold / codegen endpoint.",
    priceUsd: "0.10",
    tags: ["resources"],
  },
] as const;

const BY_KIND = new Map(CATALOG.map((e) => [e.kind, e]));

export function getCatalogEntry(kind: string): CatalogEntry | undefined {
  return BY_KIND.get(kind as ResourceKind);
}

export function resourceUrl(origin: string, kind: ResourceKind | string): string {
  const entry = getCatalogEntry(kind);
  const base = origin.replace(/\/$/, "");
  return `${base}${entry?.path ?? `/api/${kind}`}`;
}

export function payCurlHint(origin: string, kind: ResourceKind | string, body?: unknown): string {
  const url = resourceUrl(origin, kind);
  if (body === undefined) {
    return `pay curl ${url}`;
  }
  const json = JSON.stringify(body);
  return `pay curl ${url} -H "Content-Type: application/json" -d '${json}'`;
}
