/**
 * SOON holder access for Security Desk scout routes.
 */
import {
  getSoonBalanceAtomic,
  getSoonDecimals,
  isSoonLaunched,
  resolveSoonTier,
  SOON_TIERS,
  type SoonTierId,
} from "./soon-token";
import { isRawSecurityKind, type X402ResourceKind, type X402SecurityKind } from "./x402-pricing";
import { SECURITY_ROUTE_TIERS, type SecurityAccessTier } from "./concierge-security-scope";

const WALLET_HEADER = "x-soon-holder-wallet";
const ALT_WALLET_HEADER = "x-solana-wallet";
const USAGE_KEY_PREFIX = "soon:security-scout:";

const OWNER_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const TIER_MIN_HOLD: Record<SecurityAccessTier, SoonTierId> = {
  scout: "deluxe",
  analyst: "executive",
  principal: "president",
};

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

const devUsage = new Map<string, { day: string; count: number }>();

function isEnabled(): boolean {
  if (process.env.SOON_SECURITY_FREE_TIER_ENABLED === "false") return false;
  return isSoonLaunched();
}

function freeCallsPerDay(): number {
  const n = Number(process.env.SOON_SECURITY_SCOUT_FREE_PER_DAY ?? "3");
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 20) : 3;
}

function minHoldForTier(tierId: SoonTierId): number {
  return SOON_TIERS.find((t) => t.id === tierId)?.minHold ?? SOON_TIERS[0].minHold;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function walletFromSecurityRequest(request: Request): string | null {
  const w =
    request.headers.get(WALLET_HEADER)?.trim() ||
    request.headers.get(ALT_WALLET_HEADER)?.trim() ||
    "";
  return OWNER_RE.test(w) ? w : null;
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

async function getUsageCount(wallet: string): Promise<number> {
  const day = todayUtc();
  const key = `${USAGE_KEY_PREFIX}${day}:${wallet}`;
  if (hasRedis()) {
    const kv = await kvClient();
    const n = await kv.get<number>(key);
    return typeof n === "number" ? n : 0;
  }
  const row = devUsage.get(key);
  return row?.day === day ? row.count : 0;
}

async function incrementUsage(wallet: string): Promise<number> {
  const day = todayUtc();
  const key = `${USAGE_KEY_PREFIX}${day}:${wallet}`;
  const next = (await getUsageCount(wallet)) + 1;
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(key, next, { ex: 86_400 });
  } else {
    devUsage.set(key, { day, count: next });
  }
  return next;
}

export type SoonSecurityFreeTierResult =
  | { ok: true; wallet: string; tier: string; remainingToday: number }
  | { ok: false; reason: string };

export async function trySoonSecurityFreeTier(
  request: Request,
  kind: X402ResourceKind,
): Promise<SoonSecurityFreeTierResult> {
  if (!isEnabled() || !isRawSecurityKind(kind)) {
    return { ok: false, reason: "not_applicable" };
  }

  const wallet = walletFromSecurityRequest(request);
  if (!wallet) return { ok: false, reason: "wallet_header_required" };

  const balanceAtomic = await getSoonBalanceAtomic(wallet);
  if (balanceAtomic === null) return { ok: false, reason: "balance_check_failed" };

  const decimals = getSoonDecimals();
  const balanceUi = Number(balanceAtomic) / 10 ** decimals;
  const tier = resolveSoonTier(balanceUi);
  const minHold = minHoldForTier(TIER_MIN_HOLD.scout);
  if (!tier || balanceUi < minHold) {
    return { ok: false, reason: "insufficient_soon_balance" };
  }

  const used = await getUsageCount(wallet);
  const limit = freeCallsPerDay();
  if (used >= limit) return { ok: false, reason: "daily_limit_reached" };

  await incrementUsage(wallet);
  return {
    ok: true,
    wallet,
    tier: tier.label,
    remainingToday: Math.max(0, limit - used - 1),
  };
}

export class SecurityTierDeniedError extends Error {
  readonly code = "security_tier_denied" as const;

  constructor(message: string) {
    super(message);
    this.name = "SecurityTierDeniedError";
  }
}

/** Verify SOON holder meets minimum tier for a security route (when not paying USDC). */
export async function assertSoonSecurityTierAccess(
  request: Request,
  routeKind: X402SecurityKind | "security-scope",
): Promise<void> {
  const accessTier = SECURITY_ROUTE_TIERS[routeKind];
  if (!accessTier) return;

  const requiredSoonId = TIER_MIN_HOLD[accessTier];
  const minHold = minHoldForTier(requiredSoonId);

  const wallet = walletFromSecurityRequest(request);
  if (!wallet) {
    throw new SecurityTierDeniedError(
      `SOON holder wallet required for ${accessTier} tier — set X-Soon-Holder-Wallet or pay via x402`,
    );
  }

  const balanceAtomic = await getSoonBalanceAtomic(wallet);
  if (balanceAtomic === null) {
    throw new SecurityTierDeniedError("SOON balance check failed");
  }

  const balanceUi = Number(balanceAtomic) / 10 ** getSoonDecimals();
  const tier = resolveSoonTier(balanceUi);
  if (!tier || balanceUi < minHold) {
    throw new SecurityTierDeniedError(
      `Insufficient SOON for ${accessTier} security desk — minimum ${minHold.toLocaleString()} SOON (${requiredSoonId})`,
    );
  }
}
