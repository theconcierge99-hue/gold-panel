/**
 * Token Pay authorization — registry cross-check before self-settle.
 * Ensures each payment is tied to a registered merchant (mint, payTo, resource scope).
 */
import { normalizeSolPayTo } from "../x402-address";
import {
  getTokenPayMerchant,
  isTokenPayMerchantLive,
  merchantSupportsResource,
} from "./registry";
import type { TokenPayMerchant, TokenPaySelfSettleRequirement } from "./types";

function normalizePayTo(addr: string): string {
  return normalizeSolPayTo(addr) ?? addr.trim();
}

export function isTokenPaySelfSettleRequirement(req: { extra?: Record<string, unknown> }): boolean {
  return req.extra?.settlement === "self";
}

function normalizeSolanaNetwork(network: string): string {
  if (!network.startsWith("solana:")) return network;
  const ref = network.slice(7);
  if (ref.length > 32) return `solana:${ref.slice(0, 32)}`;
  return network;
}

/** Match self-settle rail (mint, payTo, network) — amount may drift with oracle between 402 and sign. */
export function tokenPaySelfSettleRailMatches(
  serverAccept: TokenPaySelfSettleRequirement,
  signedAccept: TokenPaySelfSettleRequirement,
): boolean {
  if (!isTokenPaySelfSettleRequirement(serverAccept) || !isTokenPaySelfSettleRequirement(signedAccept)) {
    return false;
  }
  if (serverAccept.scheme !== signedAccept.scheme) return false;
  if (normalizeSolanaNetwork(serverAccept.network) !== normalizeSolanaNetwork(signedAccept.network)) {
    return false;
  }
  if (serverAccept.asset !== signedAccept.asset) return false;
  if (normalizePayTo(serverAccept.payTo) !== normalizePayTo(signedAccept.payTo)) return false;
  const sMid = serverAccept.extra?.merchantId;
  const aMid = signedAccept.extra?.merchantId;
  if (typeof sMid === "string" && typeof aMid === "string" && sMid !== aMid) return false;
  return true;
}

/**
 * Resolve x402 accept for verify: exact match first, else self-settle rail + signed amount.
 */
export function resolveTokenPayMatchedAccept(
  serverAccepts: TokenPaySelfSettleRequirement[],
  signedAccept: TokenPaySelfSettleRequirement | undefined,
): TokenPaySelfSettleRequirement | null {
  if (!signedAccept) return null;

  const exact = serverAccepts.find(
    (req) => tokenPaySelfSettleRailMatches(req, signedAccept) && req.amount === signedAccept.amount,
  );
  if (exact) return exact;

  if (!isTokenPaySelfSettleRequirement(signedAccept) || !signedAccept.amount) return null;
  const rail = serverAccepts.find((req) => tokenPaySelfSettleRailMatches(req, signedAccept));
  if (!rail) return null;
  return { ...rail, amount: signedAccept.amount };
}

export function assertTokenPaySelfSettleAuthorized(
  matched: TokenPaySelfSettleRequirement,
  resourceKind: string,
): TokenPayMerchant {
  if (!isTokenPaySelfSettleRequirement(matched)) {
    throw new Error("Not a token pay self-settle requirement");
  }

  const merchantId = matched.extra?.merchantId;
  if (typeof merchantId !== "string" || !merchantId.trim()) {
    throw new Error("Token payment missing merchantId");
  }

  const merchant = getTokenPayMerchant(merchantId.trim());
  if (!merchant || !merchant.x402Enabled || !isTokenPayMerchantLive(merchant)) {
    throw new Error("Token payment merchant not authorized");
  }

  if (!merchantSupportsResource(merchant, resourceKind)) {
    throw new Error("Token payment not allowed for this resource");
  }

  if (!merchant.mint || matched.asset !== merchant.mint) {
    throw new Error("Token payment asset does not match merchant mint");
  }

  const expectedPayTo = merchant.payTo ? normalizePayTo(merchant.payTo) : null;
  const actualPayTo = normalizePayTo(matched.payTo);
  if (!expectedPayTo || actualPayTo !== expectedPayTo) {
    throw new Error("Token payment payTo does not match merchant wallet");
  }

  return merchant;
}
