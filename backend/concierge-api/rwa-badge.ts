import type { CreatorSignal } from "./signals-types";
import type { ReaderBadge, ReaderBadgeProfile, ReaderBadgeTier, RwaTargetChain } from "./rwa-types";
import {
  findReaderBadgeForSignal,
  getReaderUnlockCount,
  listReaderBadges,
  saveReaderBadge,
} from "./rwa-store";

export const READER_BADGE_TIERS: ReaderBadgeTier[] = [
  { slug: "scout", label: "Intel Scout", tier: 1, minUnlocks: 1 },
  { slug: "analyst", label: "Intel Analyst", tier: 2, minUnlocks: 5 },
  { slug: "strategist", label: "Intel Strategist", tier: 3, minUnlocks: 15 },
  { slug: "principal", label: "Principal Reader", tier: 4, minUnlocks: 40 },
  { slug: "sovereign", label: "Sovereign Intel", tier: 5, minUnlocks: 100 },
];

export function walletChainFromAddress(wallet: string): RwaTargetChain {
  return wallet.trim().startsWith("0x") ? "evm" : "sol";
}

export function tierForUnlockCount(count: number): ReaderBadgeTier {
  let current = READER_BADGE_TIERS[0];
  for (const t of READER_BADGE_TIERS) {
    if (count >= t.minUnlocks) current = t;
  }
  return current;
}

function newBadgeId(wallet: string, signalId: string): string {
  const w = wallet.slice(0, 8).replace(/[^a-zA-Z0-9]/g, "");
  const s = signalId.replace(/^sig_/, "").slice(0, 12);
  return `badge_${w}_${s}_${Date.now().toString(36)}`;
}

/** Award a reader badge when a signal is unlocked (one per wallet + signal). */
export async function awardReaderBadge(opts: {
  readerWallet: string;
  signal: CreatorSignal;
  unlockTx?: string;
}): Promise<{ badge: ReaderBadge; profile: ReaderBadgeProfile; isNew: boolean }> {
  const wallet = opts.readerWallet.trim();
  const existing = await findReaderBadgeForSignal(wallet, opts.signal.id);
  if (existing) {
    const profile = await getReaderBadgeProfile(wallet);
    return { badge: existing, profile, isNew: false };
  }

  const prior = await getReaderUnlockCount(wallet);
  const nextCount = prior + 1;
  const tier = tierForUnlockCount(nextCount);

  const badge: ReaderBadge = {
    badgeId: newBadgeId(wallet, opts.signal.id),
    wallet,
    walletChain: walletChainFromAddress(wallet),
    signalId: opts.signal.id,
    signalTitle: opts.signal.title,
    badgeSlug: tier.slug,
    badgeLabel: tier.label,
    tier: tier.tier,
    readerUnlockCount: nextCount,
    unlockTx: opts.unlockTx,
    awardedAt: new Date().toISOString(),
  };

  await saveReaderBadge(badge);

  const profile = await getReaderBadgeProfile(wallet);
  return { badge, profile, isNew: true };
}

export async function getReaderBadgeProfile(wallet: string): Promise<ReaderBadgeProfile> {
  const w = wallet.trim();
  const totalUnlocks = await getReaderUnlockCount(w);
  const tier = tierForUnlockCount(totalUnlocks);
  const badges = await listReaderBadges(w, 48);
  return { wallet: w, totalUnlocks, tier, badges };
}
