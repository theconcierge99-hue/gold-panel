/**
 * SOON holder free tier — raw intel routes without x402 when wallet holds enough SOON.
 */
import {
  getSoonBalanceAtomic,
  getSoonDecimals,
  isSoonLaunched,
  resolveSoonTier,
  SOON_TIERS,
} from "./soon-token";
import { isRawIntelKind, type X402ResourceKind } from "./x402-pricing";

const WALLET_HEADER = "x-soon-holder-wallet";
const ALT_WALLET_HEADER = "x-solana-wallet";
const USAGE_KEY_PREFIX = "soon:free-tier:";

const OWNER_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

const devUsage = new Map<string, { day: string; count: number }>();

function isEnabled(): boolean {
  if (process.env.SOON_HOLDER_FREE_TIER_ENABLED === "false") return false;
  return isSoonLaunched();
}

function freeCallsPerDay(): number {
  const n = Number(process.env.SOON_HOLDER_FREE_RAW_PER_DAY ?? "5");
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50) : 5;
}

function minHoldUi(): number {
  const env = Number(process.env.SOON_HOLDER_MIN_TOKENS ?? "");
  if (Number.isFinite(env) && env > 0) return env;
  return SOON_TIERS[0]?.minHold ?? 50_000;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function walletFromRequest(request: Request): string | null {
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

export type SoonHolderFreeTierResult =
  | { ok: true; wallet: string; tier: string; remainingToday: number }
  | { ok: false; reason: string };

export async function trySoonHolderFreeTier(
  request: Request,
  kind: X402ResourceKind,
): Promise<SoonHolderFreeTierResult> {
  if (!isEnabled() || !isRawIntelKind(kind)) {
    return { ok: false, reason: "not_applicable" };
  }

  const wallet = walletFromRequest(request);
  if (!wallet) return { ok: false, reason: "wallet_header_required" };

  const balanceAtomic = await getSoonBalanceAtomic(wallet);
  if (balanceAtomic === null) return { ok: false, reason: "balance_check_failed" };

  const decimals = getSoonDecimals();
  const balanceUi = Number(balanceAtomic) / 10 ** decimals;
  const tier = resolveSoonTier(balanceUi);
  if (!tier || balanceUi < minHoldUi()) {
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
