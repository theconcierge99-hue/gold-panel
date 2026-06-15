/**
 * Default platform merchant — SOON (Concierge utility token).
 * Reads SOON_* env today; replace branding by adding merchants via TOKEN_PAY_MERCHANTS_JSON later.
 */
import type { TokenPayMerchant } from "../types";
import { normalizeSolanaMint } from "../mint";

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

export function buildSoonMerchantFromEnv(solPayTo: string | null): TokenPayMerchant {
  const mint = normalizeSolanaMint(
    process.env.SOON_TOKEN_MINT ?? process.env.SOON_MINT ?? "",
  );
  const priceSource =
    (process.env.SOON_PRICE_SOURCE ?? "dexscreener").trim().toLowerCase() === "env"
      ? "env"
      : "dexscreener";

  const x402Enabled = process.env.SOON_X402_ENABLED !== "false";

  return {
    id: SOON_MERCHANT_ID,
    symbol: process.env.TOKEN_PAY_SOON_SYMBOL?.trim() || "SOON",
    name: process.env.TOKEN_PAY_SOON_NAME?.trim() || "SOON",
    mint,
    decimals: numEnv("SOON_TOKEN_DECIMALS", 6),
    payTo: solPayTo,
    x402Enabled,
    price: {
      source: priceSource,
      fallbackUsd: optionalUsd("SOON_USDC_RATE"),
      maxAgeSec: Math.min(Math.max(numEnv("SOON_PRICE_MAX_AGE_SEC", 60), 10), 300),
      usdMin: optionalUsd("SOON_USD_MIN"),
      usdMax: optionalUsd("SOON_USD_MAX"),
    },
    resourceKinds: ["concierge"],
    comingSoonMessage:
      process.env.TOKEN_PAY_SOON_COMING_SOON?.trim() ||
      "SOON — not available yet. Will unlock after token launch.",
  };
}
