/**
 * TCX prepaid credits — off-chain ledger in Vercel KV (1 credit = $0.01 USDC peg).
 */
import { getSoonBalanceAtomic, getSoonDecimals, isSoonLaunched, resolveSoonTier, SOON_TIERS } from "./soon-token";
import { creditsCostForResource, type X402ResourceKind } from "./x402-pricing";
import { normalizeSolanaWallet } from "./tcx-health-core";

export type TcxCreditsProfile = {
  wallet: string;
  balanceCredits: number;
  totalSpentCredits: number;
  totalGrantedCredits: number;
  welcomeGranted: boolean;
  updatedAt: string;
};

const CREDITS_KEY_PREFIX = "tcx:credits:";
const WALLET_HEADER = "x-tcx-credits-wallet";
const ALT_WALLET_HEADER = "x-solana-wallet";

const devProfiles = new Map<string, TcxCreditsProfile>();

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
  return `${CREDITS_KEY_PREFIX}${wallet.trim()}`;
}

function emptyProfile(wallet: string): TcxCreditsProfile {
  return {
    wallet: wallet.trim(),
    balanceCredits: 0,
    totalSpentCredits: 0,
    totalGrantedCredits: 0,
    welcomeGranted: false,
    updatedAt: new Date().toISOString(),
  };
}

export function tcxCreditsEnabled(): boolean {
  if (process.env.TCX_CREDITS_ENABLED === "false") return false;
  return isSoonLaunched();
}

function welcomeCredits(): number {
  const n = Number(process.env.TCX_CREDITS_WELCOME ?? "100");
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10_000) : 100;
}

function minHoldForCredits(): number {
  const env = Number(process.env.TCX_CREDITS_MIN_HOLD ?? "");
  if (Number.isFinite(env) && env > 0) return env;
  return SOON_TIERS[0]?.minHold ?? 1_000_000;
}

export function walletFromCreditsHeader(request: Request): string | null {
  const w =
    request.headers.get(WALLET_HEADER)?.trim() ||
    request.headers.get(ALT_WALLET_HEADER)?.trim() ||
    "";
  return normalizeSolanaWallet(w);
}

export async function getTcxCreditsProfile(wallet: string): Promise<TcxCreditsProfile> {
  const w = normalizeSolanaWallet(wallet);
  if (!w) return emptyProfile("");
  if (hasRedis()) {
    const kv = await kvClient();
    return (await kv.get<TcxCreditsProfile>(walletKey(w))) ?? emptyProfile(w);
  }
  return devProfiles.get(w) ?? emptyProfile(w);
}

async function saveProfile(profile: TcxCreditsProfile): Promise<TcxCreditsProfile> {
  const w = normalizeSolanaWallet(profile.wallet);
  if (!w) return profile;
  const next = { ...profile, wallet: w, updatedAt: new Date().toISOString() };
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(walletKey(w), next);
  } else {
    devProfiles.set(w, next);
  }
  return next;
}

async function isEligibleHolder(wallet: string): Promise<boolean> {
  const balanceAtomic = await getSoonBalanceAtomic(wallet);
  if (balanceAtomic === null) return false;
  const balanceUi = Number(balanceAtomic) / 10 ** getSoonDecimals();
  const tier = resolveSoonTier(balanceUi);
  return !!tier && balanceUi >= minHoldForCredits();
}

/** Grant welcome credits once for eligible TCX holders. */
export async function ensureTcxWelcomeCredits(wallet: string): Promise<TcxCreditsProfile> {
  let profile = await getTcxCreditsProfile(wallet);
  if (profile.welcomeGranted) return profile;
  if (!tcxCreditsEnabled()) return profile;
  if (!(await isEligibleHolder(wallet))) return profile;

  const grant = welcomeCredits();
  profile = {
    ...profile,
    balanceCredits: profile.balanceCredits + grant,
    totalGrantedCredits: profile.totalGrantedCredits + grant,
    welcomeGranted: true,
  };
  return saveProfile(profile);
}

export async function grantTcxCredits(wallet: string, credits: number): Promise<TcxCreditsProfile> {
  const w = normalizeSolanaWallet(wallet);
  if (!w || credits <= 0) return emptyProfile(wallet);
  const profile = await getTcxCreditsProfile(w);
  return saveProfile({
    ...profile,
    balanceCredits: profile.balanceCredits + credits,
    totalGrantedCredits: profile.totalGrantedCredits + credits,
  });
}

export async function deductTcxCredits(
  wallet: string,
  credits: number,
): Promise<{ ok: true; profile: TcxCreditsProfile } | { ok: false; reason: string; profile: TcxCreditsProfile }> {
  const w = normalizeSolanaWallet(wallet);
  if (!w) return { ok: false, reason: "invalid_wallet", profile: emptyProfile("") };
  const profile = await ensureTcxWelcomeCredits(w);
  if (profile.balanceCredits < credits) {
    return { ok: false, reason: "insufficient_credits", profile };
  }
  const next = await saveProfile({
    ...profile,
    balanceCredits: profile.balanceCredits - credits,
    totalSpentCredits: profile.totalSpentCredits + credits,
  });
  return { ok: true, profile: next };
}

export function creditsCostForKind(kind: X402ResourceKind): number {
  return creditsCostForResource(kind);
}