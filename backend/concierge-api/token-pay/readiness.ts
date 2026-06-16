/**
 * Token Pay merchant readiness — public health checks for beta partners.
 */
import { getSolanaRpcUrlForServer } from "../x402-config";
import { merchantHasTokenAccount } from "../x402-solana-rpc";
import { getTokenPayUsdRateAsync, tokenPayAtomicForResourceAsync } from "./x402";
import {
  isTokenPayMerchantLive,
  merchantSupportsResource,
} from "./registry";
import type { TokenPayMerchant } from "./types";

export type TokenPayMerchantStatus =
  | "ready"
  | "coming_soon"
  | "disabled"
  | "missing_mint"
  | "missing_pay_to"
  | "price_unavailable"
  | "ata_missing";

export type TokenPayMerchantReadiness = {
  status: TokenPayMerchantStatus;
  /** Human-readable one-liner for dashboards */
  statusLabel: string;
  /** Merchant passes registry live gate (mint + payTo + price rules) */
  live: boolean;
  /** Will appear in 402 accepts for the probed resource */
  acceptReady: boolean;
  checks: {
    registered: boolean;
    x402Enabled: boolean;
    mintConfigured: boolean;
    payToConfigured: boolean;
    priceResolvable: boolean;
    merchantTokenAta: boolean | null;
    conciergeAtomic: boolean;
    supportsResource: boolean;
  };
  blockers: string[];
};

function statusLabelFor(status: TokenPayMerchantStatus): string {
  switch (status) {
    case "ready":
      return "Ready — token will appear in 402 accepts";
    case "coming_soon":
      return "Coming soon — mint or launch pending";
    case "disabled":
      return "Disabled — x402Enabled is false";
    case "missing_mint":
      return "Mint not configured";
    case "missing_pay_to":
      return "payTo wallet not configured";
    case "price_unavailable":
      return "Price oracle failed — set fallbackUsd or DexScreener liquidity";
    case "ata_missing":
      return "Merchant wallet cannot receive token yet — send a tiny amount once";
    default:
      return "Unknown";
  }
}

export async function getTokenPayMerchantReadiness(
  merchant: TokenPayMerchant,
  resourceKind = "concierge",
  usdcAmount = 0.1,
): Promise<TokenPayMerchantReadiness> {
  const blockers: string[] = [];
  const supportsResource = merchantSupportsResource(merchant, resourceKind);

  if (!merchant.x402Enabled) blockers.push("x402Enabled is false");
  if (!merchant.mint) blockers.push("mint is not set");
  if (!merchant.payTo) blockers.push("payTo is not set");
  if (!supportsResource) blockers.push(`resourceKinds does not include "${resourceKind}"`);

  let priceResolvable = false;
  let conciergeAtomic: string | null = null;
  if (merchant.mint && merchant.x402Enabled) {
    const price = await getTokenPayUsdRateAsync(merchant);
    priceResolvable = price != null;
    if (!priceResolvable) {
      blockers.push("USD price not resolvable (DexScreener or fallbackUsd)");
    } else {
      conciergeAtomic = await tokenPayAtomicForResourceAsync(usdcAmount, merchant);
      if (!conciergeAtomic) blockers.push("Could not compute atomic amount for resource");
    }
  }

  let merchantTokenAta: boolean | null = null;
  if (merchant.payTo && merchant.mint && isTokenPayMerchantLive(merchant)) {
    try {
      merchantTokenAta = await merchantHasTokenAccount(
        merchant.payTo,
        merchant.mint,
        getSolanaRpcUrlForServer(),
      );
      if (merchantTokenAta === false) {
        blockers.push("Merchant token ATA not initialized on Solana");
      }
    } catch {
      merchantTokenAta = null;
    }
  }

  const live = isTokenPayMerchantLive(merchant);
  const acceptReady =
    live &&
    supportsResource &&
    priceResolvable &&
    !!conciergeAtomic &&
    merchantTokenAta !== false;

  let status: TokenPayMerchantStatus;
  if (!merchant.x402Enabled) status = "disabled";
  else if (!merchant.mint) status = "coming_soon";
  else if (!merchant.payTo) status = "missing_pay_to";
  else if (!priceResolvable) status = "price_unavailable";
  else if (merchantTokenAta === false) status = "ata_missing";
  else if (acceptReady) status = "ready";
  else if (!live) status = "coming_soon";
  else status = "price_unavailable";

  return {
    status,
    statusLabel: statusLabelFor(status),
    live,
    acceptReady,
    checks: {
      registered: true,
      x402Enabled: merchant.x402Enabled,
      mintConfigured: !!merchant.mint,
      payToConfigured: !!merchant.payTo,
      priceResolvable,
      merchantTokenAta,
      conciergeAtomic: !!conciergeAtomic,
      supportsResource,
    },
    blockers,
  };
}
