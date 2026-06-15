const METEORA_FETCH_MS = 12_000;
const METEORA_MIN_TVL_USD = 25_000;
const YIELD_MAX_APY = 5000;

export type MeteoraDlmmPoolRow = {
  address: string;
  symbol: string;
  apy: string;
  tvlUsd: string;
  tokenX: string;
  tokenY: string;
  decimalsX: number;
  decimalsY: number;
  currentPrice: number | null;
};

type MeteoraApiPool = {
  address?: string;
  name?: string;
  apy?: number;
  apr?: number;
  tvl?: number;
  is_blacklisted?: boolean;
  current_price?: number;
  token_x?: { address?: string; decimals?: number };
  token_y?: { address?: string; decimals?: number };
};

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

async function fetchJson<T>(url: string, timeoutMs = METEORA_FETCH_MS): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Screened Meteora DLMM pools with on-chain pool addresses for manual bot UI. */
export async function fetchMeteoraDlmmPools(options?: {
  limit?: number;
  sortByApy?: boolean;
  minTvlUsd?: number;
}): Promise<MeteoraDlmmPoolRow[]> {
  const data = await fetchJson<{ data?: MeteoraApiPool[] }>(
    "https://dlmm.datapi.meteora.ag/pools?page=1&limit=80&sort_by=tvl:desc",
    METEORA_FETCH_MS,
  );
  if (!data?.data?.length) return [];

  const minTvl = options?.minTvlUsd ?? METEORA_MIN_TVL_USD;
  const screened = data.data.filter((p) => {
    if (p.is_blacklisted || !p.address) return false;
    const tvl = p.tvl ?? 0;
    const apy = p.apy ?? p.apr ?? 0;
    if (tvl < minTvl) return false;
    if (apy <= 0 || apy > YIELD_MAX_APY) return false;
    return true;
  });

  const ranked = options?.sortByApy
    ? [...screened].sort((a, b) => (b.apy ?? b.apr ?? 0) - (a.apy ?? a.apr ?? 0))
    : screened;

  return ranked.slice(0, options?.limit ?? 16).map((p) => ({
    address: p.address!,
    symbol: p.name ?? "—",
    apy: `${(p.apy ?? p.apr ?? 0).toFixed(2)}%`,
    tvlUsd: fmtUsd(p.tvl ?? NaN),
    tokenX: p.token_x?.address ?? "",
    tokenY: p.token_y?.address ?? "",
    decimalsX: p.token_x?.decimals ?? 6,
    decimalsY: p.token_y?.decimals ?? 6,
    currentPrice: p.current_price ?? null,
  }));
}
