import {
  getCreatorPointsProfile,
  saveCreatorPointsProfile,
  type CreatorPointsProfile,
  type CreatorPointsReason,
} from "./creator-points-store";

export type { CreatorPointsProfile, CreatorPointsReason };
export { getCreatorPointsProfile };

/** Awarded once when a signal is published to the Lounge feed. */
export const CREATOR_POINTS_PUBLISH = 25;

/** Awarded to the signal author on each paid reader unlock. */
export const CREATOR_POINTS_PER_UNLOCK = 10;

export type CreatorBadgeTier = {
  slug: string;
  label: string;
  tier: number;
  minPoints: number;
};

/** Creator standing tiers — separate from reader unlock badges. */
export const CREATOR_BADGE_TIERS: CreatorBadgeTier[] = [
  { slug: "contributor", label: "Desk Contributor", tier: 1, minPoints: 25 },
  { slug: "analyst", label: "Signal Analyst", tier: 2, minPoints: 100 },
  { slug: "strategist", label: "Intel Strategist", tier: 3, minPoints: 300 },
  { slug: "principal", label: "Principal Author", tier: 4, minPoints: 750 },
  { slug: "sovereign", label: "Sovereign Desk", tier: 5, minPoints: 2000 },
];

export function tierForCreatorPoints(points: number): CreatorBadgeTier | null {
  if (points < CREATOR_BADGE_TIERS[0].minPoints) return null;
  let matched: CreatorBadgeTier = CREATOR_BADGE_TIERS[0];
  for (const t of CREATOR_BADGE_TIERS) {
    if (points >= t.minPoints) matched = t;
  }
  return matched;
}

export function nextCreatorTier(current: CreatorBadgeTier | null): CreatorBadgeTier | null {
  if (!current) return CREATOR_BADGE_TIERS[0] ?? null;
  const idx = CREATOR_BADGE_TIERS.findIndex((t) => t.slug === current.slug);
  if (idx < 0 || idx >= CREATOR_BADGE_TIERS.length - 1) return null;
  return CREATOR_BADGE_TIERS[idx + 1] ?? null;
}

export type CreatorStanding = {
  profile: CreatorPointsProfile;
  tier: CreatorBadgeTier | null;
  nextTier: CreatorBadgeTier | null;
  pointsToNextTier: number | null;
};

export async function getCreatorStanding(wallet: string): Promise<CreatorStanding> {
  const profile = await getCreatorPointsProfile(wallet);
  const tier = tierForCreatorPoints(profile.totalPoints);
  const nextTier = nextCreatorTier(tier);
  const pointsToNextTier =
    nextTier != null ? Math.max(0, nextTier.minPoints - profile.totalPoints) : null;
  return { profile, tier, nextTier, pointsToNextTier };
}

export type CreatorPointsAward = {
  points: number;
  reason: CreatorPointsReason;
  profile: CreatorPointsProfile;
};

export async function awardCreatorPoints(opts: {
  wallet: string;
  reason: CreatorPointsReason;
  points?: number;
}): Promise<CreatorPointsAward> {
  const wallet = opts.wallet.trim();
  const points =
    opts.points ??
    (opts.reason === "publish" ? CREATOR_POINTS_PUBLISH : CREATOR_POINTS_PER_UNLOCK);
  const profile = await getCreatorPointsProfile(wallet);

  const next: CreatorPointsProfile = {
    ...profile,
    wallet,
    totalPoints: profile.totalPoints + points,
    signalsPublished: profile.signalsPublished + (opts.reason === "publish" ? 1 : 0),
    totalUnlocks: profile.totalUnlocks + (opts.reason === "unlock" ? 1 : 0),
    updatedAt: new Date().toISOString(),
  };

  await saveCreatorPointsProfile(next);
  return { points, reason: opts.reason, profile: next };
}

export function publicCreatorPointsMeta() {
  return {
    enabled: true,
    publishPoints: CREATOR_POINTS_PUBLISH,
    unlockPoints: CREATOR_POINTS_PER_UNLOCK,
    tiers: CREATOR_BADGE_TIERS.map((t) => ({
      slug: t.slug,
      label: t.label,
      tier: t.tier,
      minPoints: t.minPoints,
    })),
    note: "Creators earn Lounge points on publish and each reader unlock. No USDC revenue share — reader unlock fees stay with the protocol.",
  };
}
