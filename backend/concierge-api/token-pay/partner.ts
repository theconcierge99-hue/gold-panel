/**
 * Token Pay partner / external API — build accepts + verify on partner domains.
 * Settlement still runs on Concierge (self-settle); revenue to merchant payTo.
 */
import { normalizeSolPayTo } from "../x402-address";
import { getX402NetworkProfile, getMerchantAddresses } from "../x402-config";
import { tokenPayAtomicForResourceAsync, buildTokenPayAcceptExtra } from "./x402";
import {
  getTokenPayMerchant,
  isTokenPayMerchantLive,
  merchantSupportsResource,
} from "./registry";
import { verifyAndSettleTokenPaySelf } from "./self-settle";
import type { TokenPayMerchant, TokenPayPaymentPayload, TokenPaySelfSettleRequirement } from "./types";

export const TOKEN_PAY_EXTERNAL_RESOURCE_KIND = "external";

const MIN_USD = 0.000_001;
const MAX_USD = 10_000;

export function clampPartnerUsdAmount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < MIN_USD) throw new Error("Invalid usdAmount");
  return Math.min(n, MAX_USD);
}

function normalizePayTo(addr: string): string {
  return normalizeSolPayTo(addr) ?? addr.trim();
}

function normalizeSolanaNetwork(network: string): string {
  if (!network.startsWith("solana:")) return network;
  const ref = network.slice(7);
  if (ref.length > 32) return `solana:${ref.slice(0, 32)}`;
  return network;
}

export function assertPartnerOrigin(request: Request, merchant: TokenPayMerchant): void {
  const allowed = merchant.allowedOrigins;
  if (!allowed?.length) return;
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return;
  if (!allowed.some((o) => origin === o.trim())) {
    throw new Error("Origin not allowed for this merchant");
  }
}

export function merchantSupportsExternal(merchant: TokenPayMerchant): boolean {
  return merchantSupportsResource(merchant, TOKEN_PAY_EXTERNAL_RESOURCE_KIND);
}

export async function buildTokenPayPartnerAcceptAsync(input: {
  merchantId: string;
  usdAmount: number;
  resourceUrl?: string;
  network?: string;
}): Promise<{
  accept: TokenPaySelfSettleRequirement;
  merchantId: string;
  usdAmount: number;
  resourceKind: string;
  resourceUrl?: string;
  network: string;
  label: string;
}> {
  const merchantId = input.merchantId.trim();
  const merchant = getTokenPayMerchant(merchantId);
  if (!merchant || !isTokenPayMerchantLive(merchant)) {
    throw new Error("Merchant not found or not live");
  }
  if (!merchantSupportsExternal(merchant)) {
    throw new Error(`Merchant does not support resourceKind "${TOKEN_PAY_EXTERNAL_RESOURCE_KIND}"`);
  }

  const usdAmount = clampPartnerUsdAmount(input.usdAmount);
  const { sol } = getMerchantAddresses();
  const network = input.network?.trim() || getX402NetworkProfile().sol;
  const payTo = (merchant.payTo ?? sol ?? "").trim();
  if (!payTo || !merchant.mint) throw new Error("Merchant mint or payTo not configured");

  const amount = await tokenPayAtomicForResourceAsync(usdAmount, merchant);
  if (!amount) throw new Error("Could not compute token amount for this price");

  const resourceUrl = input.resourceUrl?.trim() || undefined;
  const accept: TokenPaySelfSettleRequirement = {
    scheme: "exact",
    network,
    amount,
    asset: merchant.mint,
    payTo,
    maxTimeoutSeconds: 120,
    extra: {
      ...buildTokenPayAcceptExtra(merchant),
      ...(resourceUrl ? { resourceUrl } : {}),
    },
  };

  return {
    accept,
    merchantId,
    usdAmount,
    resourceKind: TOKEN_PAY_EXTERNAL_RESOURCE_KIND,
    resourceUrl,
    network,
    label: `${amount} atomic ${merchant.symbol}`,
  };
}

export function tokenPayAcceptMatches(
  accepted: TokenPaySelfSettleRequirement,
  expected: TokenPaySelfSettleRequirement,
): boolean {
  if (accepted.scheme !== expected.scheme) return false;
  if (normalizeSolanaNetwork(accepted.network) !== normalizeSolanaNetwork(expected.network)) {
    return false;
  }
  if (accepted.amount !== expected.amount) return false;
  if (accepted.asset !== expected.asset) return false;
  if (normalizePayTo(accepted.payTo) !== normalizePayTo(expected.payTo)) return false;
  const aMid = accepted.extra?.merchantId;
  const eMid = expected.extra?.merchantId;
  if (typeof aMid === "string" && typeof eMid === "string" && aMid !== eMid) return false;
  return true;
}

export async function verifyTokenPayPartnerPayment(input: {
  paymentPayload: TokenPayPaymentPayload;
  merchantId: string;
  usdAmount: number;
  resourceUrl?: string;
}): Promise<{ payer: string; transaction: string; network: string }> {
  const expected = await buildTokenPayPartnerAcceptAsync({
    merchantId: input.merchantId,
    usdAmount: input.usdAmount,
    resourceUrl: input.resourceUrl,
  });

  const accepted = input.paymentPayload.accepted as TokenPaySelfSettleRequirement | undefined;
  if (!accepted || !tokenPayAcceptMatches(accepted, expected.accept)) {
    throw new Error("Payment does not match accepted requirements");
  }

  return verifyAndSettleTokenPaySelf(
    input.paymentPayload,
    accepted,
    TOKEN_PAY_EXTERNAL_RESOURCE_KIND,
  );
}
