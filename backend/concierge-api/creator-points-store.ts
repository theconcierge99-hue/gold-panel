export type CreatorPointsReason = "publish" | "unlock";

export type CreatorPointsProfile = {
  wallet: string;
  totalPoints: number;
  signalsPublished: number;
  totalUnlocks: number;
  updatedAt: string;
};

const CREATOR_POINTS_KEY = "lounge:creator-points:";

const devProfiles = new Map<string, CreatorPointsProfile>();

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function walletKey(wallet: string): string {
  return `${CREATOR_POINTS_KEY}${wallet.trim().toLowerCase()}`;
}

function emptyProfile(wallet: string): CreatorPointsProfile {
  return {
    wallet: wallet.trim(),
    totalPoints: 0,
    signalsPublished: 0,
    totalUnlocks: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function getCreatorPointsProfile(wallet: string): Promise<CreatorPointsProfile> {
  const w = wallet.trim();
  if (!w) return emptyProfile("");
  if (hasRedis()) {
    const kv = await kvClient();
    return (await kv.get<CreatorPointsProfile>(walletKey(w))) ?? emptyProfile(w);
  }
  return devProfiles.get(w.toLowerCase()) ?? emptyProfile(w);
}

export async function saveCreatorPointsProfile(profile: CreatorPointsProfile): Promise<void> {
  const w = profile.wallet.trim();
  if (!w) return;
  const next = { ...profile, wallet: w, updatedAt: new Date().toISOString() };
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(walletKey(w), next);
    return;
  }
  devProfiles.set(w.toLowerCase(), next);
}
