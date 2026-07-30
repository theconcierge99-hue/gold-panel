/**
 * Default platform merchant — SOON (Concierge utility token / TCX).
 * Reads SOON_* env today; replace branding by adding merchants via TOKEN_PAY_MERCHANTS_JSON later.
 */
import { ALL_X402_RESOURCE_KINDS } from "../../x402-pricing";
import type { TokenPayMerchant } from "../types";
import { normalizeSolanaMint } from "../mint";
import { normalizeSolPayTo } from "../../x402-address";

function numEnv(key: string, fallback: number): number {
  const n = Number(process.env[key] ?? String(fallback));
  return Number.isFinite(n) ? n : fallback;
}

function optionalUsd(key: string): number | null {
  const raw = (process.env[key] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const SOON_MERCHANT_ID = "soon";

/**
 * Canonical TCX receive wallet (owner of ATA 6f2JW47bc7NSCM7m8TzTdv3gZkry92JABdwLaQubvd7b).
 * Hard-pinned so Token Pay never drifts if X402_SOL_PAY_TO is mis-set.
 */
export const SOON_MERCHANT_PAY_TO = "9uiwHcDNYg8rbPDRaJBfMHVo8f8CAgCCZzz1JB6XyEFN";

/** TCX Token-2022 mint (pump.fun). */
export const SOON_TOKEN_MINT_CANONICAL = "F2bnJW1z55UQ9ZqGX5RwYQfvNJrd23n66eyBV5QZpump";

/** Pre-launch default — concierge only. Post-launch snapshot uses SOON_RESOURCE_KINDS=all. */
const SOON_DEFAULT_RESOURCE_KINDS = ["concierge"];

function parseSoonResourceKinds(): string[] {
  const raw = (process.env.SOON_RESOURCE_KINDS ?? "").trim();
  if (!raw) return [...SOON_DEFAULT_RESOURCE_KINDS];
  if (raw.toLowerCase() === "all") return [...ALL_X402_RESOURCE_KINDS];
  const kinds = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return kinds.length ? kinds : [...SOON_DEFAULT_RESOURCE_KINDS];
}

/** Holder discount when paying in SOON (0–90). Post-launch snapshot sets e.g. 30. */
export function getSoonTokenDiscountPercent(): number {
  const n = Number(process.env.SOON_TOKEN_DISCOUNT_PERCENT ?? "0");
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(90, Math.floor(n));
}

/** Resolve TCX payTo — always the canonical merchant wallet. */
export function resolveSoonMerchantPayTo(solPayTo?: string | null): string {
  const fromEnv = normalizeSolPayTo(solPayTo ?? undefined);
  if (fromEnv && fromEnv !== SOON_MERCHANT_PAY_TO) {
    console.warn(
      `[token-pay] X402_SOL_PAY_TO (${fromEnv}) differs from canonical TCX wallet; using ${SOON_MERCHANT_PAY_TO}`,
    );
  }
  return SOON_MERCHANT_PAY_TO;
}

export function buildSoonMerchantFromEnv(solPayTo: string | null): TokenPayMerchant {
  const mint =
    normalizeSolanaMint(process.env.SOON_TOKEN_MINT ?? process.env.SOON_MINT ?? "") ||
    normalizeSolanaMint(SOON_TOKEN_MINT_CANONICAL);
  const priceSource =
    (process.env.SOON_PRICE_SOURCE ?? "dexscreener").trim().toLowerCase() === "env"
      ? "env"
      : "dexscreener";

  const x402Enabled = process.env.SOON_X402_ENABLED !== "false";

  return {
    id: SOON_MERCHANT_ID,
    symbol: process.env.TOKEN_PAY_SOON_SYMBOL?.trim() || "TCX",
    name: process.env.TOKEN_PAY_SOON_NAME?.trim() || "TCX",
    mint,
    decimals: numEnv("SOON_TOKEN_DECIMALS", 6),
    payTo: resolveSoonMerchantPayTo(solPayTo),
    x402Enabled,
    price: {
      source: priceSource,
      fallbackUsd: optionalUsd("SOON_USDC_RATE"),
      maxAgeSec: Math.min(Math.max(numEnv("SOON_PRICE_MAX_AGE_SEC", 60), 10), 300),
      usdMin: optionalUsd("SOON_USD_MIN"),
      usdMax: optionalUsd("SOON_USD_MAX"),
    },
    resourceKinds: parseSoonResourceKinds(),
    comingSoonMessage:
      process.env.TOKEN_PAY_SOON_COMING_SOON?.trim() ||
      "TCX pay unavailable — set SOON_TOKEN_MINT on server.",
  };
}
