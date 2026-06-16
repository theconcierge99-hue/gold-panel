/**
 * Token Pay Platform — shared types for multi-merchant native-token x402 (self-settle).
 * UI may still say "SOON"; swap merchant id / branding via registry + env.
 */

export type TokenPayPriceSource = "dexscreener" | "env";

/** Solana SPL merchant accepting x402 self-settle for their native token. */
export type TokenPayMerchant = {
  /** Stable slug, e.g. `soon`, `acme`. */
  id: string;
  /** Ticker shown in UI, e.g. SOON. */
  symbol: string;
  /** Long name for docs / OpenAPI. */
  name: string;
  /** SPL mint (base58). null = listed as coming soon. */
  mint: string | null;
  decimals: number;
  /** Solana receive address (usually merchant X402_SOL_PAY_TO). */
  payTo: string | null;
  /** When false, never offer this token in x402 accepts. */
  x402Enabled: boolean;
  price: {
    source: TokenPayPriceSource;
    /** USD per 1 token (fallback when oracle fails or source=env). */
    fallbackUsd: number | null;
    maxAgeSec: number;
    usdMin: number | null;
    usdMax: number | null;
  };
  /** x402 resource kinds that may list this token, e.g. concierge, external. */
  resourceKinds: string[];
  /** Origins allowed to call partner build/verify APIs (browser). Omit = any origin. */
  allowedOrigins?: string[];
  /** Shown in pay modal when mint unset (pre-launch). */
  comingSoonMessage: string;
};

export type ResolvedTokenPrice = {
  usd: number;
  source: TokenPayPriceSource;
};

export type TokenPayAcceptExtra = {
  settlement: "self";
  merchantId: string;
  name: string;
  decimals: number;
};

export type TokenPayPlatformMeta = {
  name: string;
  version: string;
  settlement: "self";
  priceOracle: "dexscreener" | "env";
  defaultMerchantId: string;
  merchantCount: number;
  note: string;
};

export type TokenPayPublicMerchant = {
  id: string;
  symbol: string;
  name: string;
  mint?: string;
  decimals: number;
  x402Enabled: boolean;
  live: boolean;
  priceSource: TokenPayPriceSource;
  fallbackUsd?: number;
  resourceKinds: string[];
  allowedOrigins?: string[];
  comingSoonMessage: string;
};

export type TokenPaySelfSettleRequirement = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

export type TokenPayPaymentPayload = {
  x402Version?: number;
  accepted?: TokenPaySelfSettleRequirement;
  payload?: { transaction?: string } | unknown;
};
