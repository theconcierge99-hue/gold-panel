/**
 * Concierge intel bridge — enrich Meridian-style screening with Concierge meteora intel.
 */
const FETCH_MS = 8_000;

/**
 * @param {string} origin
 * @param {object} criteria
 * @returns {Promise<{ pools: Array<object>; source: string; error?: string }>}
 */
export async function fetchConciergeMeteoraIntel(origin, criteria = {}) {
  const base = String(origin || "").replace(/\/$/, "");
  if (!base) {
    return { pools: [], source: "none", error: "concierge_origin_unset" };
  }

  try {
    const res = await fetch(`${base}/api/concierge-intel-meteora`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "ConciergeLP-Worker/0.1",
      },
      body: JSON.stringify({
        message: "hottest Meteora DLMM pools for LP screening",
        minTvl: criteria.minTvl ?? 50_000,
        maxApy: criteria.maxApy ?? 250,
      }),
      signal: AbortSignal.timeout(FETCH_MS),
    });

    if (res.status === 402) {
      // Paid route — fall back to public Meteora datapi (handled by caller)
      return { pools: [], source: "concierge-402", error: "payment_required" };
    }
    if (!res.ok) {
      return { pools: [], source: "concierge-error", error: `http_${res.status}` };
    }

    const data = await res.json();
    const rows = extractPools(data);
    return { pools: rows, source: "concierge-intel-meteora" };
  } catch (e) {
    return { pools: [], source: "concierge-error", error: e?.message || "fetch_failed" };
  }
}

function extractPools(data) {
  const candidates =
    data?.pools ||
    data?.meteora ||
    data?.result?.pools ||
    data?.data?.pools ||
    data?.screened ||
    [];
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((p) => ({
      name: String(p.name || p.pair || "—"),
      address: p.address || p.pool || null,
      pair: String(p.pair || p.name || "—"),
      tvlUsd: parseUsd(p.tvlUsd || p.tvl),
      apy: parseApy(p.apy || p.apr),
      volume24hUsd: parseUsd(p.volume24hUsd || p.volume24h || p.volume),
      binStep: p.binStep ?? p.bin_step ?? null,
      baseFeePct: p.baseFeePct ?? p.base_fee_percentage ?? null,
      riskFlags: Array.isArray(p.riskFlags) ? p.riskFlags : [],
      conciergeScore: scorePool(p),
    }))
    .filter((p) => p.address || p.name !== "—");
}

function parseUsd(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(/[$,BMK]/gi, (m) => {
      if (m === "B") return "e9";
      if (m === "M") return "e6";
      if (m === "K") return "e3";
      return "";
    }));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseApy(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/%/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function scorePool(p) {
  const tvl = parseUsd(p.tvlUsd || p.tvl);
  const apy = parseApy(p.apy || p.apr);
  const flags = Array.isArray(p.riskFlags) ? p.riskFlags : [];
  let score = 50;
  if (tvl >= 500_000) score += 15;
  else if (tvl >= 150_000) score += 8;
  if (apy >= 10 && apy <= 80) score += 15;
  else if (apy > 80) score -= 10;
  if (flags.includes("blacklisted") || flags.includes("suspicious_apy")) score -= 40;
  if (flags.includes("elevated_apy_il_risk")) score -= 8;
  if (flags.includes("low_tvl")) score -= 12;
  return Math.max(0, Math.min(100, score));
}

/**
 * Merge Concierge intel pools with public Meteora datapi rows.
 */
export function mergeScreening(publicPools, intelPools, criteria = {}) {
  const minTvl = Number(criteria.minTvl ?? 50_000);
  const minFeeTvl = Number(criteria.minFeeTvl ?? 0);
  const minOrganic = Number(criteria.minOrganicScore ?? 0);
  const byAddr = new Map();

  for (const p of publicPools || []) {
    const addr = p.address || p.pubkey;
    if (!addr) continue;
    byAddr.set(addr, {
      ...p,
      address: addr,
      conciergeScore: p.conciergeScore ?? 40,
      sources: ["meteora-datapi"],
    });
  }

  for (const p of intelPools || []) {
    if (!p.address) continue;
    const prev = byAddr.get(p.address);
    if (prev) {
      byAddr.set(p.address, {
        ...prev,
        ...p,
        conciergeScore: Math.max(prev.conciergeScore || 0, p.conciergeScore || 0),
        sources: [...new Set([...(prev.sources || []), "concierge-intel"])],
      });
    } else {
      byAddr.set(p.address, { ...p, sources: ["concierge-intel"] });
    }
  }

  return [...byAddr.values()]
    .filter((p) => (p.tvlUsd ?? p.tvl ?? 0) >= minTvl)
    .filter((p) => {
      if (!minFeeTvl) return true;
      const feeTvl = Number(p.feeTvlRatio ?? p.fee_tvl ?? 0);
      return feeTvl >= minFeeTvl;
    })
    .filter((p) => {
      if (!minOrganic) return true;
      return Number(p.organicScore ?? p.organic_score ?? 100) >= minOrganic;
    })
    .sort((a, b) => (b.conciergeScore || 0) - (a.conciergeScore || 0))
    .slice(0, 20);
}
