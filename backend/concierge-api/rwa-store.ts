import type { ReaderBadge, SignalRwaToken } from "./rwa-types";

const RWA_TOKEN_PREFIX = "lounge:rwa:token:";
const RWA_BADGE_PREFIX = "lounge:rwa:badge:";
const RWA_WALLET_BADGES = "lounge:rwa:wallet-badges:";
const RWA_WALLET_UNLOCKS = "lounge:rwa:wallet-unlocks:";
const MAX_BADGES_PER_WALLET = 200;

const devTokens = new Map<string, SignalRwaToken>();
const devBadges = new Map<string, ReaderBadge>();
const devWalletBadgeIds = new Map<string, string[]>();
const devWalletUnlocks = new Map<string, number>();

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function tokenKey(signalId: string): string {
  return `${RWA_TOKEN_PREFIX}${signalId}`;
}

function badgeKey(badgeId: string): string {
  return `${RWA_BADGE_PREFIX}${badgeId}`;
}

function walletBadgesKey(wallet: string): string {
  return `${RWA_WALLET_BADGES}${wallet.toLowerCase()}`;
}

function walletUnlocksKey(wallet: string): string {
  return `${RWA_WALLET_UNLOCKS}${wallet.toLowerCase()}`;
}

export async function saveSignalRwaToken(token: SignalRwaToken): Promise<void> {
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(tokenKey(token.signalId), token);
    return;
  }
  devTokens.set(token.signalId, token);
}

export async function getSignalRwaToken(signalId: string): Promise<SignalRwaToken | null> {
  const sid = signalId.trim();
  if (!sid) return null;
  if (hasRedis()) {
    const kv = await kvClient();
    return (await kv.get<SignalRwaToken>(tokenKey(sid))) ?? null;
  }
  return devTokens.get(sid) ?? null;
}

export async function getReaderUnlockCount(wallet: string): Promise<number> {
  const w = wallet.trim();
  if (!w) return 0;
  if (hasRedis()) {
    const kv = await kvClient();
    const n = await kv.get<number>(walletUnlocksKey(w));
    return typeof n === "number" && n >= 0 ? n : 0;
  }
  return devWalletUnlocks.get(w.toLowerCase()) ?? 0;
}

async function setReaderUnlockCount(wallet: string, count: number): Promise<void> {
  const w = wallet.trim();
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(walletUnlocksKey(w), count);
    return;
  }
  devWalletUnlocks.set(w.toLowerCase(), count);
}

export async function findReaderBadgeForSignal(
  wallet: string,
  signalId: string,
): Promise<ReaderBadge | null> {
  const badges = await listReaderBadges(wallet, MAX_BADGES_PER_WALLET);
  return badges.find((b) => b.signalId === signalId) ?? null;
}

export async function saveReaderBadge(badge: ReaderBadge): Promise<number> {
  const w = badge.wallet.trim();
  const existing = await findReaderBadgeForSignal(w, badge.signalId);
  if (existing) {
    return existing.readerUnlockCount;
  }

  const nextCount = (await getReaderUnlockCount(w)) + 1;
  const withCount = { ...badge, readerUnlockCount: nextCount };

  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(badgeKey(badge.badgeId), withCount);
    const idsKey = walletBadgesKey(w);
    const ids = (await kv.get<string[]>(idsKey)) ?? [];
    const nextIds = [badge.badgeId, ...ids.filter((id) => id !== badge.badgeId)].slice(
      0,
      MAX_BADGES_PER_WALLET,
    );
    await kv.set(idsKey, nextIds);
    await setReaderUnlockCount(w, nextCount);
    return nextCount;
  }

  devBadges.set(badge.badgeId, withCount);
  const wKey = w.toLowerCase();
  const ids = devWalletBadgeIds.get(wKey) ?? [];
  devWalletBadgeIds.set(wKey, [badge.badgeId, ...ids.filter((id) => id !== badge.badgeId)].slice(0, MAX_BADGES_PER_WALLET));
  devWalletUnlocks.set(wKey, nextCount);
  return nextCount;
}

export async function listReaderBadges(wallet: string, limit = 40): Promise<ReaderBadge[]> {
  const w = wallet.trim();
  if (!w) return [];

  if (hasRedis()) {
    const kv = await kvClient();
    const ids = (await kv.get<string[]>(walletBadgesKey(w))) ?? [];
    const out: ReaderBadge[] = [];
    for (const id of ids.slice(0, limit)) {
      const b = await kv.get<ReaderBadge>(badgeKey(id));
      if (b) out.push(b);
    }
    return out;
  }

  const wKey = w.toLowerCase();
  const ids = devWalletBadgeIds.get(wKey) ?? [];
  return ids
    .slice(0, limit)
    .map((id) => devBadges.get(id))
    .filter((b): b is ReaderBadge => !!b);
}
