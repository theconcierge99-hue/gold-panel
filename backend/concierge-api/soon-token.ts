/**
 * SOON utility token — holder tiers for Lounge features (credits, discounts, etc.).
 * Mint unset = draft / not launched.
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
  { id: "desk", label: "Desk", minHold: 50_000, utility: "Concierge credits · profile badge" },
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
