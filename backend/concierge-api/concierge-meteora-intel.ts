/**
 * Meteora DLMM deep-dive intel — Solana moat endpoint.
 */
import { fetchMeteoraDlmmYields, type YieldPoolRow } from "./concierge-defi-intel";

type MeteoraDlmmPool = {
  address?: string;
  name?: string;
  apy?: number;
  apr?: number;
  tvl?: number;
  volume?: number;
  volume_24h?: number;
  bin_step?: number;
  base_fee_percentage?: number;
  is_blacklisted?: boolean;
  mint_x?: string;
  mint_y?: string;
};

export type MeteoraPoolIntel = {
  name: string;
  address: string | null;
  pair: string;
  tvlUsd: string;
  apy: string;
  volume24hUsd: string | null;
  binStep: number | null;
  baseFeePct: number | null;
  riskFlags: string[];
};

const METEORA_POOLS_URL = "https://dlmm.datapi.meteora.ag/pools?page=1&limit=80&sort_by=tvl:desc";
const FETCH_MS = 4_500;
const MIN_TVL = 50_000;
const MAX_APY = 250;

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function riskFlagsFor(pool: MeteoraDlmmPool, apy: number, tvl: number): string[] {
  const flags: string[] = [];
  if (pool.is_blacklisted) flags.push("blacklisted");
  if (apy > 80) flags.push("elevated_apy_il_risk");
  if (tvl < 150_000) flags.push("low_tvl");
  if (apy > MAX_APY) flags.push("suspicious_apy");
  return flags;
}

async function fetchMeteoraPools(): Promise<MeteoraDlmmPool[]> {
  try {
    const res = await fetch(METEORA_POOLS_URL, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { Accept: "application/json", "User-Agent": "ExecutiveLounge/1.0" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: MeteoraDlmmPool[] };
    return data?.data ?? [];
  } catch {
    return [];
  }
}

function toPoolIntel(pool: MeteoraDlmmPool): MeteoraPoolIntel | null {
  const tvl = pool.tvl ?? 0;
  const apy = pool.apy ?? pool.apr ?? 0;
  if (pool.is_blacklisted || tvl < MIN_TVL || apy <= 0 || apy > MAX_APY) return null;

  const vol = pool.volume_24h ?? pool.volume ?? null;
  return {
    name: pool.name ?? "—",
    address: pool.address ?? null,
    pair: pool.name ?? "—",
    tvlUsd: fmtUsd(tvl),
    apy: `${apy.toFixed(2)}%`,
    volume24hUsd: vol != null ? fmtUsd(vol) : null,
    binStep: pool.bin_step ?? null,
    baseFeePct: pool.base_fee_percentage ?? null,
    riskFlags: riskFlagsFor(pool, apy, tvl),
  };
}

export type MeteoraIntelOptions = {
  sortByApy?: boolean;
  limit?: number;
  /** Substring match on pool name */
  poolHint?: string;
};

export async function runMeteoraIntel(options?: MeteoraIntelOptions): Promise<{
  ok: true;
  kind: "intel-meteora";
  dataAsOf: string;
  sources: string[];
  filters: { poolHint: string | null; sortByApy: boolean };
  pools: MeteoraPoolIntel[];
  topByTvl: YieldPoolRow[];
  methodology: string[];
}> {
  const fetchedAt = new Date().toISOString();
  const limit = Math.min(Math.max(options?.limit ?? 12, 1), 20);
  const hint = options?.poolHint?.trim().toLowerCase() ?? "";

  const raw = await fetchMeteoraPools();
  let screened = raw.map(toPoolIntel).filter((p): p is MeteoraPoolIntel => p !== null);

  if (hint) {
    screened = screened.filter(
      (p) => p.name.toLowerCase().includes(hint) || (p.address ?? "").toLowerCase().includes(hint),
    );
  }

  if (options?.sortByApy) {
    screened.sort((a, b) => parseFloat(b.apy) - parseFloat(a.apy));
  }

  const topByTvl = await fetchMeteoraDlmmYields({ limit: 8, sortByApy: false });

  return {
    ok: true,
    kind: "intel-meteora",
    dataAsOf: fetchedAt,
    sources: ["Meteora DLMM API (dlmm.datapi.meteora.ag)"],
    filters: { poolHint: hint || null, sortByApy: !!options?.sortByApy },
    pools: screened.slice(0, limit),
    topByTvl,
    methodology: [
      "Screened: TVL ≥ $50k, APY ≤ 250%, non-blacklisted pools.",
      "riskFlags: elevated_apy_il_risk (>80% APY), low_tvl (<$150k), blacklisted.",
      "Deploy liquidity on app.meteora.ag/dlmm — no in-app LP UI in Concierge.",
    ],
  };
}
