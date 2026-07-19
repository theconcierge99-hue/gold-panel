/**
 * Public Meteora DLMM pool screening (Meridian-style thresholds).
 */
const METEORA_POOLS_URL =
  "https://dlmm.datapi.meteora.ag/pools?page=1&limit=80&sort_by=tvl:desc";
const FETCH_MS = 6_000;

/**
 * @param {object} criteria
 */
export async function fetchMeteoraPools(criteria = {}) {
  try {
    const res = await fetch(METEORA_POOLS_URL, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { Accept: "application/json", "User-Agent": "ConciergeLP-Worker/0.1" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const minTvl = Number(criteria.minTvl ?? 50_000);
    const maxApy = Number(criteria.maxApy ?? 250);
    return rows
      .filter((p) => !p.is_blacklisted)
      .filter((p) => (p.tvl ?? 0) >= minTvl)
      .filter((p) => {
        const apy = p.apy ?? p.apr ?? 0;
        return apy > 0 && apy <= maxApy;
      })
      .map((p) => ({
        name: p.name || "—",
        address: p.address,
        pair: p.name || "—",
        tvlUsd: p.tvl ?? 0,
        apy: p.apy ?? p.apr ?? 0,
        volume24hUsd: p.volume_24h ?? p.volume ?? 0,
        binStep: p.bin_step ?? null,
        baseFeePct: p.base_fee_percentage ?? null,
        feeTvlRatio: p.tvl > 0 ? (p.volume_24h ?? 0) / p.tvl : 0,
        organicScore: p.organic_score ?? p.organicScore ?? null,
        conciergeScore: 45,
      }));
  } catch {
    return [];
  }
}
