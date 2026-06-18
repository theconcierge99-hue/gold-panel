/**
 * SOON utility token — holder tiers for Lounge features (credits, discounts, governance).
 * Mint unset = draft / not launched.
 * Align copy with frontend/public/token.html and GET /api/x402-config → soonHolderTiers.
 */
import { getSolanaRpcUrlForServer } from "./x402-config";
import { solanaRpcCall } from "./x402-solana-rpc";

export type SoonTierId = "deluxe" | "executive" | "president";

export type SoonBenefitStatus = "live" | "phased";

export type SoonBenefit = {
  id: string;
  label: string;
  detail: string;
  status: SoonBenefitStatus;
  /** e.g. "2026 · Q4" — omitted when live */
  phase?: string;
};

export type SoonTier = {
  id: SoonTierId;
  label: string;
  minHold: number;
  headline: string;
  benefits: SoonBenefit[];
};

/** Holder tiers — min balance at snapshot + 7-day hold for phased perks. */
export const SOON_TIERS: SoonTier[] = [
  {
    id: "deluxe",
    label: "Deluxe",
    minHold: 50_000,
    headline: "Entry holder · raw intel allowance",
    benefits: [
      {
        id: "soon-checkout",
        label: "SOON checkout (all 17 routes)",
        detail: "~30% less SOON vs USDC list price (SOON_TOKEN_DISCOUNT_PERCENT). 80% of each payment burns.",
        status: "live",
      },
      {
        id: "free-raw",
        label: "Free raw intel",
        detail: "5 calls/day on intel-tvl, intel-macro, intel-wire, intel-whales via X-Soon-Holder-Wallet — no x402.",
        status: "live",
      },
      {
        id: "public-free",
        label: "Public free routes",
        detail: "GET /api/concierge-intel-accuracy and GET/POST /api/mcp — no hold required.",
        status: "live",
      },
      {
        id: "concierge-credits",
        label: "Concierge credits",
        detail: "3 free Lounge chat calls / month ($0.10 routes).",
        status: "phased",
        phase: "2026 · Q4",
      },
      {
        id: "profile-badge",
        label: "Lounge profile badge",
        detail: "Holder dot on connected wallet in Executive Lounge.",
        status: "phased",
        phase: "2026 · Q4",
      },
    ],
  },
  {
    id: "executive",
    label: "Executive",
    minHold: 250_000,
    headline: "Builder holder · agents & signals",
    benefits: [
      {
        id: "inherits-deluxe",
        label: "Everything in Deluxe",
        detail: "Includes live SOON checkout and raw intel allowance.",
        status: "live",
      },
      {
        id: "free-raw-executive",
        label: "Higher raw allowance",
        detail: "10 free raw intel calls / day (same four routes).",
        status: "phased",
        phase: "2027 · Q1",
      },
      {
        id: "discover-badge",
        label: "Discover agent badge",
        detail: "Verified SOON holder badge on agt_… cards when min hold met at snapshot.",
        status: "phased",
        phase: "2027 · Q1",
      },
      {
        id: "signal-credits",
        label: "Signal unlock credits",
        detail: "2 signal-open ($0.10) credits / month in Lounge.",
        status: "phased",
        phase: "2027 · Q1",
      },
      {
        id: "transparency-early",
        label: "Transparency early access",
        detail: "Weekly revenue report 24h before public /token/transparency post.",
        status: "phased",
        phase: "2027 · Q1",
      },
      {
        id: "publish-rebate",
        label: "Signal publish bonus",
        detail: "Extra Lounge points on signal publish (replaces legacy $1 publish rebate).",
        status: "phased",
        phase: "2027 · Q1",
      },
    ],
  },
  {
    id: "president",
    label: "President",
    minHold: 1_000_000,
    headline: "Top holder · integrations & governance",
    benefits: [
      {
        id: "inherits-executive",
        label: "Everything in Executive",
        detail: "Full builder holder stack when live.",
        status: "phased",
        phase: "2027 · Q1",
      },
      {
        id: "free-raw-president",
        label: "President raw allowance",
        detail: "15 free raw intel calls / day for integration wallets.",
        status: "phased",
        phase: "2027 · Q2+",
      },
      {
        id: "bundle-discount",
        label: "Desk-brief bundle",
        detail: "intel-desk-brief ($0.25) at ~20% lower effective SOON vs list.",
        status: "phased",
        phase: "2027 · Q2+",
      },
      {
        id: "macro-webhook",
        label: "Macro webhook beta",
        detail: "Optional POST callback when intel-macro desk updates (integration beta).",
        status: "phased",
        phase: "2027 · Q2+",
      },
      {
        id: "rate-limits",
        label: "Integration headroom",
        detail: "Higher concurrent x402 / Token Pay throughput for registered agent wallets.",
        status: "phased",
        phase: "2027 · Q2+",
      },
      {
        id: "governance",
        label: "Quarterly governance vote",
        detail:
          "Snapshot-weighted advisory poll: treasury grant slate, next intel desk priority, buyback vs LP emphasis within published policy. Results on transparency page — non-binding; ops team retains execution control.",
        status: "phased",
        phase: "2027 · Q2+",
      },
    ],
  },
];

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function getSoonMint(): string | null {
  const raw = (process.env.SOON_TOKEN_MINT ?? process.env.SOON_MINT ?? "").trim();
  return MINT_RE.test(raw) ? raw : null;
}

export function getSoonDecimals(): number {
  const n = Number(process.env.SOON_TOKEN_DECIMALS ?? "6");
  return Number.isFinite(n) && n >= 0 && n <= 12 ? Math.floor(n) : 6;
}

export function isSoonLaunched(): boolean {
  return getSoonMint() !== null;
}

function sumParsedTokenBalances(rows: unknown[] | undefined): bigint {
  let total = 0n;
  for (const row of rows ?? []) {
    const acct = row as {
      account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } };
    };
    const amt = acct.account?.data?.parsed?.info?.tokenAmount?.amount;
    if (amt) total += BigInt(amt);
  }
  return total;
}

export async function getSoonBalanceAtomic(
  ownerAddress: string,
  rpcUrl?: string,
): Promise<bigint | null> {
  const mint = getSoonMint();
  if (!mint) return null;
  const rpc = rpcUrl ?? getSolanaRpcUrlForServer();
  const result = await solanaRpcCall<{ value?: unknown[] }>(rpc, "getTokenAccountsByOwner", [
    ownerAddress,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  if (result === null) return null;
  return sumParsedTokenBalances(result.value);
}

export function resolveSoonTier(balanceUi: number): SoonTier | null {
  let matched: SoonTier | null = null;
  for (const tier of SOON_TIERS) {
    if (balanceUi >= tier.minHold) matched = tier;
  }
  return matched;
}

/** Public API shape for /api/x402-config */
export function publicSoonHolderTiers() {
  return {
    snapshotNote: "Phased perks require a published snapshot + 7-day minimum continuous hold. Live rails (SOON pay, free raw) follow env after mint is set.",
    tiers: SOON_TIERS.map((t) => ({
      id: t.id,
      label: t.label,
      minHold: t.minHold,
      headline: t.headline,
      benefits: t.benefits.map((b) => ({
        id: b.id,
        label: b.label,
        detail: b.detail,
        status: b.status,
        phase: b.phase ?? null,
      })),
    })),
  };
}
