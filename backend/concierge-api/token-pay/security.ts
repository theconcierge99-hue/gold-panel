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
