/**
 * x402 integration — default merchant accepts for Token Pay platform.
 */
import {
  formatTokenUiFromAtomic,
  getTokenUsdRateAsync,
  tokenAtomicForUsdcAsync,
  tokenAtomicForUsdcSync,
} from "./amount";
import {
  getDefaultTokenPayMerchant,
  getDefaultTokenPayMerchantId,
  isTokenPayMerchantLive,
  listTokenPayMerchants,
  merchantSupportsResource,
} from "./registry";
import type { TokenPayAcceptExtra, TokenPayMerchant, TokenPaySelfSettleRequirement } from "./types";

export type TokenPayAcceptBuildInput = {
  resourceKind: string;
  usdcAmount: number;
  network: string;
  /** Fallback when merchant has no dedicated payTo (e.g. SOON uses X402_SOL_PAY_TO). */
  fallbackSolPayTo: string | null;
};

export function getTokenPayMerchantForX402(): TokenPayMerchant {
  return getDefaultTokenPayMerchant();
}

export function isTokenPayX402Live(merchant: TokenPayMerchant = getDefaultTokenPayMerchant()): boolean {
  return isTokenPayMerchantLive(merchant);
}

export function tokenPaySupportsResource(
  resourceKind: string,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): boolean {
  return merchant.x402Enabled && merchantSupportsResource(merchant, resourceKind);
}

export function buildTokenPayAcceptExtra(merchant: TokenPayMerchant): TokenPayAcceptExtra {
  return {
    settlement: "self",
    merchantId: merchant.id,
    name: merchant.symbol,
    decimals: merchant.decimals,
  };
}

export async function tokenPayAtomicForResourceAsync(
  usdcAmount: number,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): Promise<string | null> {
  if (!isTokenPayMerchantLive(merchant)) return null;
  return tokenAtomicForUsdcAsync(merchant, usdcAmount);
}

export function tokenPayAtomicForResourceSync(
  usdcAmount: number,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): string | null {
  if (!merchant.mint) return null;
  return tokenAtomicForUsdcSync(merchant, usdcAmount);
}

export async function getTokenPayUsdRateAsync(
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
) {
  return getTokenUsdRateAsync(merchant);
}

export function formatTokenPayUiFromAtomic(
  atomic: string,
  merchant: TokenPayMerchant = getDefaultTokenPayMerchant(),
): string {
  return formatTokenUiFromAtomic(merchant, atomic);
}

/** Live merchants that may appear in x402 accepts for a resource kind. */
export function listTokenPayMerchantsForResource(resourceKind: string): TokenPayMerchant[] {
  return listTokenPayMerchants().filter(
    (m) => tokenPaySupportsResource(resourceKind, m) && isTokenPayX402Live(m),
  );
}

/** Build self-settle accepts for every live merchant on a resource (beta multi-merchant). */
export async function buildTokenPayAcceptsForResourceAsync(
  input: TokenPayAcceptBuildInput,
): Promise<TokenPaySelfSettleRequirement[]> {
  const { resourceKind, usdcAmount, network, fallbackSolPayTo } = input;
  const accepts: TokenPaySelfSettleRequirement[] = [];

  for (const merchant of listTokenPayMerchants()) {
    if (!tokenPaySupportsResource(resourceKind, merchant) || !isTokenPayX402Live(merchant)) {
      continue;
    }
    const payTo = (merchant.payTo ?? fallbackSolPayTo ?? "").trim();
    if (!payTo || !merchant.mint) continue;

    const tokenAmount = await tokenPayAtomicForResourceAsync(usdcAmount, merchant);
    if (!tokenAmount) continue;

    accepts.push({
      scheme: "exact",
      network,
      amount: tokenAmount,
      asset: merchant.mint,
      payTo,
      maxTimeoutSeconds: 120,
      extra: buildTokenPayAcceptExtra(merchant),
    });
  }

  return accepts;
}

/** Human-readable price labels for all live token options on a resource. */
export async function formatTokenPayPriceLabelsForResourceAsync(
  resourceKind: string,
  usdcAmount: number,
): Promise<string[]> {
  const labels: string[] = [];
  for (const merchant of listTokenPayMerchantsForResource(resourceKind)) {
    const atomic = await tokenPayAtomicForResourceAsync(usdcAmount, merchant);
    if (atomic) labels.push(formatTokenPayUiFromAtomic(atomic, merchant));
  }
  return labels;
}

export { getDefaultTokenPayMerchantId };
