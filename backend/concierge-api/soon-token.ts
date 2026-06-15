/**
 * SOON utility token gate — holder tiers for Lounge features (DLMM bot, credits, etc.).
 * Mint unset = draft / not launched (UI preview only).
 */
import { getSolanaRpcUrlForServer } from "./x402-config";
import { solanaRpcCall } from "./x402-solana-rpc";

export type SoonTierId = "desk" | "agent" | "institutional";

export type SoonTier = {
  id: SoonTierId;
  label: string;
  minHold: number;
  utility: string;
};

/** Draft tiers — align with frontend/public/token.html */
export const SOON_TIERS: SoonTier[] = [
  { id: "desk", label: "Desk", minHold: 50_000, utility: "DLMM bot · Concierge credits" },
  { id: "agent", label: "Agent", minHold: 250_000, utility: "Intel discount · Discover priority" },
  { id: "institutional", label: "Institutional", minHold: 1_000_000, utility: "Rate limits · macro webhook beta" },
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

/** Minimum SOON hold to unlock manual DLMM bot (default: Desk tier). */
export function getSoonDlmmMinHold(): number {
  const n = Number(process.env.SOON_DLMM_MIN_HOLD ?? String(SOON_TIERS[0].minHold));
  return Number.isFinite(n) && n > 0 ? n : SOON_TIERS[0].minHold;
}

export function isSoonGatePreview(): boolean {
  return process.env.SOON_GATE_PREVIEW === "true";
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

export type SoonGateResult = {
  launched: boolean;
  preview: boolean;
  mint: string | null;
  decimals: number;
  dlmmMinHold: number;
  tiers: SoonTier[];
  balanceUi: number | null;
  balanceAtomic: string | null;
  tier: SoonTierId | null;
  dlmmUnlocked: boolean;
  reason: string;
};

export async function evaluateSoonGate(ownerAddress?: string | null): Promise<SoonGateResult> {
  const launched = isSoonLaunched();
  const preview = isSoonGatePreview();
  const mint = getSoonMint();
  const decimals = getSoonDecimals();
  const dlmmMinHold = getSoonDlmmMinHold();
  const tiers = SOON_TIERS;

  if (!launched) {
    return {
      launched: false,
      preview,
      mint: null,
      decimals,
      dlmmMinHold,
      tiers,
      balanceUi: null,
      balanceAtomic: null,
      tier: null,
      dlmmUnlocked: preview,
      reason: preview
        ? "SOON not launched — preview mode enabled"
        : "SOON not launched yet — connect wallet to preview; bot unlocks after token goes live",
    };
  }

  if (!ownerAddress?.trim()) {
    return {
      launched: true,
      preview,
      mint,
      decimals,
      dlmmMinHold,
      tiers,
      balanceUi: null,
      balanceAtomic: null,
      tier: null,
      dlmmUnlocked: false,
      reason: "Connect wallet to verify SOON balance",
    };
  }

  const atomic = await getSoonBalanceAtomic(ownerAddress.trim());
  if (atomic === null) {
    return {
      launched: true,
      preview,
      mint,
      decimals,
      dlmmMinHold,
      tiers,
      balanceUi: null,
      balanceAtomic: null,
      tier: null,
      dlmmUnlocked: preview,
      reason: preview ? "Balance check failed — preview mode" : "Could not read SOON balance",
    };
  }

  const balanceUi = Number(atomic) / 10 ** decimals;
  const tier = resolveSoonTier(balanceUi);
  const dlmmUnlocked = preview || balanceUi >= dlmmMinHold;

  return {
    launched: true,
    preview,
    mint,
    decimals,
    dlmmMinHold,
    tiers,
    balanceUi,
    balanceAtomic: atomic.toString(),
    tier: tier?.id ?? null,
    dlmmUnlocked,
    reason: dlmmUnlocked
      ? preview && balanceUi < dlmmMinHold
        ? "Preview mode — SOON hold not required"
        : `Unlocked · ${tier?.label ?? "Desk"} tier`
      : `Hold at least ${dlmmMinHold.toLocaleString()} SOON to use DLMM bot (you have ${Math.floor(balanceUi).toLocaleString()})`,
  };
}
