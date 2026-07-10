/**
 * TCX holder health — public stats + wallet tier resolution (Hobby-safe, snapshot-based).
 */
import { isAddress as isSolanaAddress } from "@solana/addresses";
import {
  getSoonBalanceAtomic,
  getSoonDecimals,
  getSoonMint,
  isSoonLaunched,
  publicSoonHolderTiers,
  resolveSoonTier,
  SOON_TIERS,
  type SoonTier,
} from "./soon-token";
import { getSolanaRpcUrlForServer } from "./x402-config";
import { solanaRpcCall } from "./x402-solana-rpc";

export type TcxDistributionBand = {
  id: string;
  label: string;
  range: string;
  pct: number;
  conciergeTier: string | null;
};

export type TcxHolderSnapshot = {
  snapshotDate: string;
  phase: "pre-t0" | "live";
  note: string;
  bands: TcxDistributionBand[];
  stats: {
    totalHolders: number | null;
    circulatingSupply: string | null;
  };
};

function tierMinHold(id: "deluxe" | "executive" | "president"): number {
  return SOON_TIERS.find((t) => t.id === id)?.minHold ?? 0;
}

function formatBandAmount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(0)}K`;
  }
  return n.toLocaleString();
}

export function defaultTcxDistributionBands(): TcxDistributionBand[] {
  const deluxe = tierMinHold("deluxe");
  const executive = tierMinHold("executive");
  const president = tierMinHold("president");
  const crabMin = Math.round(deluxe / 10);
  return [
    { id: "shrimp", label: "Shrimp", range: `< ${formatBandAmount(crabMin)} TCX`, pct: 42, conciergeTier: null },
    {
      id: "crab",
      label: "Crab",
      range: `${formatBandAmount(crabMin)} – ${formatBandAmount(deluxe)}`,
      pct: 28,
      conciergeTier: null,
    },
    {
      id: "fish",
      label: "Fish · Deluxe",
      range: `${formatBandAmount(deluxe)} – ${formatBandAmount(executive)}`,
      pct: 18,
      conciergeTier: "deluxe",
    },
    {
      id: "dolphin",
      label: "Dolphin · Executive",
      range: `${formatBandAmount(executive)} – ${formatBandAmount(president)}`,
      pct: 8,
      conciergeTier: "executive",
    },
    {
      id: "whale",
      label: "Whale · President",
      range: `≥ ${formatBandAmount(president)} TCX`,
      pct: 4,
      conciergeTier: "president",
    },
  ];
}

export const DEFAULT_TCX_SNAPSHOT: TcxHolderSnapshot = {
  snapshotDate: "2026-07-07",
  phase: "pre-t0",
  note: "",
  bands: defaultTcxDistributionBands(),
  stats: { totalHolders: null, circulatingSupply: null },
};

const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function normalizeSolanaWallet(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!WALLET_RE.test(s)) return null;
  try {
    if (isSolanaAddress(s)) return s;
  } catch {
    return null;
  }
  return null;
}

const SOON_TIER_LADDER = SOON_TIERS.map((t) => ({ id: t.id, label: t.label, minHold: t.minHold }));

export async function loadTcxHolderSnapshot(origin: string): Promise<TcxHolderSnapshot> {
  const base = origin.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/data/tcx-holder-snapshot.json`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return DEFAULT_TCX_SNAPSHOT;
    const data = (await res.json()) as Partial<TcxHolderSnapshot>;
    if (!Array.isArray(data.bands) || data.bands.length === 0) return DEFAULT_TCX_SNAPSHOT;
    return {
      snapshotDate: typeof data.snapshotDate === "string" ? data.snapshotDate : DEFAULT_TCX_SNAPSHOT.snapshotDate,
      phase: data.phase === "live" ? "live" : "pre-t0",
      note: typeof data.note === "string" ? data.note : DEFAULT_TCX_SNAPSHOT.note,
      bands: data.bands as TcxDistributionBand[],
      stats: {
        totalHolders:
          typeof data.stats?.totalHolders === "number" ? data.stats.totalHolders : null,
        circulatingSupply:
          typeof data.stats?.circulatingSupply === "string" ? data.stats.circulatingSupply : null,
      },
    };
  } catch {
    return DEFAULT_TCX_SNAPSHOT;
  }
}

async function fetchMintSupplyUi(mint: string): Promise<string | null> {
  const rpc = getSolanaRpcUrlForServer();
  const result = await solanaRpcCall<{ value?: { amount?: string; decimals?: number } }>(rpc, "getTokenSupply", [
    mint,
  ]);
  const amount = result?.value?.amount;
  const decimals = result?.value?.decimals ?? getSoonDecimals();
  if (!amount) return null;
  const ui = Number(amount) / 10 ** decimals;
  if (!Number.isFinite(ui)) return null;
  return ui.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export async function buildTcxHealthPayload(origin: string) {
  const mint = getSoonMint();
  const launched = isSoonLaunched();
  const snapshot = await loadTcxHolderSnapshot(origin);
  const decimals = getSoonDecimals();

  let circulatingSupply = snapshot.stats.circulatingSupply;
  if (launched && mint && !circulatingSupply) {
    circulatingSupply = await fetchMintSupplyUi(mint);
  }

  return {
    token: "TCX",
    launched,
    mint,
    decimals,
    phase: launched ? ("live" as const) : ("pre-t0" as const),
    snapshotDate: snapshot.snapshotDate,
    snapshotNote: snapshot.note,
    distribution: snapshot.bands,
    stats: {
      totalHolders: snapshot.stats.totalHolders,
      circulatingSupply,
    },
    holderTiers: publicSoonHolderTiers(),
    signals: {
      focus: "Structure first — balance bands map to Concierge holder perks",
      coverage: "Snapshot · weekly transparency cadence",
      output: "Deluxe / Executive / President unlock matrix",
    },
    links: {
      tokenomics: "/token",
      transparency: "/token/transparency",
      health: "/lounge#token-research",
      holderApi: "/api/tcx-holder?wallet=",
      healthApi: "/api/tcx-health",
      x402Config: "/api/x402-config",
    },
  };
}

function balanceUiFromAtomic(balanceAtomic: bigint, decimals: number): number {
  return Number(balanceAtomic) / 10 ** decimals;
}

function bandForBalance(balanceUi: number, bands: TcxDistributionBand[]): TcxDistributionBand | null {
  const president = tierMinHold("president");
  const executive = tierMinHold("executive");
  const deluxe = tierMinHold("deluxe");
  const crabMin = Math.round(deluxe / 10);
  if (balanceUi >= president) return bands.find((b) => b.id === "whale") ?? null;
  if (balanceUi >= executive) return bands.find((b) => b.id === "dolphin") ?? null;
  if (balanceUi >= deluxe) return bands.find((b) => b.id === "fish") ?? null;
  if (balanceUi >= crabMin) return bands.find((b) => b.id === "crab") ?? null;
  return bands.find((b) => b.id === "shrimp") ?? null;
}

export async function buildTcxHolderPayload(origin: string, walletRaw: string) {
  const wallet = normalizeSolanaWallet(walletRaw);
  if (!wallet) {
    return { ok: false as const, error: "Invalid Solana wallet address", code: "invalid_wallet" };
  }

  const mint = getSoonMint();
  const launched = isSoonLaunched();
  const snapshot = await loadTcxHolderSnapshot(origin);
  const decimals = getSoonDecimals();

  if (!launched || !mint) {
    return {
      ok: true as const,
      wallet,
      launched: false,
      mint: null,
      balanceUi: null,
      balanceFormatted: null,
      tier: null as SoonTier | null,
      band: null as TcxDistributionBand | null,
      nextTier: SOON_TIER_LADDER[0] ?? null,
      message: "",
      benefits: [] as SoonTier["benefits"],
    };
  }

  const balanceAtomic = await getSoonBalanceAtomic(wallet);
  if (balanceAtomic === null) {
    return {
      ok: false as const,
      error: "Could not read TCX balance — RPC unavailable",
      code: "rpc_error",
    };
  }

  const balanceUi = balanceUiFromAtomic(balanceAtomic, decimals);
  const tier = resolveSoonTier(balanceUi);
  const band = bandForBalance(balanceUi, snapshot.bands);
  const nextTier = nextTierAbove(balanceUi);

  return {
    ok: true as const,
    wallet,
    launched: true,
    mint,
    balanceUi,
    balanceFormatted: balanceUi.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    tier: tier
      ? { id: tier.id, label: tier.label, minHold: tier.minHold, headline: tier.headline }
      : null,
    band: band ? { id: band.id, label: band.label, range: band.range } : null,
    nextTier,
    benefits: tier?.benefits ?? [],
    message: tier
      ? `${tier.label} tier active at current balance.`
      : `Below Deluxe minimum (${tierMinHold("deluxe").toLocaleString()} TCX). Need ${Math.max(0, tierMinHold("deluxe") - balanceUi).toLocaleString()} more TCX for entry perks.`,
  };
}

function nextTierAbove(balanceUi: number) {
  for (const t of SOON_TIER_LADDER) {
    if (balanceUi < t.minHold) {
      return { ...t, gapUi: t.minHold - balanceUi };
    }
  }
  return null;
}
