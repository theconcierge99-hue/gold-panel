/** Shared x402 / PayAI configuration (server + public config API). */

import { normalizeEvmPayTo, normalizeSolPayTo } from "./x402-address";

export const X402_PRICE_USDC = 0.1;
export const X402_PRICE_LABEL = "$0.10";
export const X402_PRICE_MONEY = "$0.10";

/** USDC atomic units (6 decimals): 0.1 USDC = 100_000 */
export const X402_PRICE_ATOMIC = "100000";

/** PayAI facilitator fee payer for Solana exact scheme */
export const SOLANA_FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

const USDC_BY_NETWORK: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

export function getUsdcAssetForNetwork(network: string): string {
  const asset = USDC_BY_NETWORK[network];
  if (!asset) throw new Error(`Unsupported x402 network: ${network}`);
  return asset;
}

export type X402NetworkProfile = {
  evm: `eip155:${number}`;
  sol: `solana:${string}`;
  label: string;
};

const MAINNET: X402NetworkProfile = {
  evm: "eip155:8453",
  sol: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  label: "Base + Solana mainnet",
};

const TESTNET: X402NetworkProfile = {
  evm: "eip155:84532",
  sol: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  label: "Base Sepolia + Solana devnet",
};

export function getX402NetworkProfile(): X402NetworkProfile {
  const mode = (process.env.X402_NETWORK_MODE || "mainnet").toLowerCase();
  return mode === "testnet" ? TESTNET : MAINNET;
}

export function getMerchantAddresses(): { evm: string | null; sol: string | null } {
  return {
    evm: normalizeEvmPayTo(process.env.X402_EVM_PAY_TO),
    sol: normalizeSolPayTo(process.env.X402_SOL_PAY_TO),
  };
}

function hasRawEvmPayToEnv(): boolean {
  return !!(process.env.X402_EVM_PAY_TO || "").trim();
}

/** When false, paid APIs are open (local dev). Set pay-to addresses to enable. */
export function isX402Enabled(): boolean {
  if (process.env.X402_ENABLED === "false") return false;
  if (process.env.X402_ENABLED === "true") return true;
  const { evm, sol } = getMerchantAddresses();
  return !!(evm || sol);
}

/** True when X402_EVM_PAY_TO is set in env but failed validation */
export function isEvmPayToMisconfigured(): boolean {
  return hasRawEvmPayToEnv() && !getMerchantAddresses().evm;
}

/** Public config for /api/x402-config — no @x402 SDK imports (Edge-safe). */
export function getPublicX402Config() {
  const nets = getX402NetworkProfile();
  const { evm, sol } = getMerchantAddresses();
  const evmEnvInvalid = isEvmPayToMisconfigured();

  return {
    enabled: isX402Enabled(),
    facilitator: "PayAI",
    facilitatorUrl: "https://facilitator.payai.network",
    priceUsdc: X402_PRICE_USDC,
    priceLabel: X402_PRICE_LABEL,
    networks: nets,
    acceptsEvm: !!evm,
    acceptsSol: !!sol,
    evmPayToReady: !!evm,
    configWarning: evmEnvInvalid
      ? "Server X402_EVM_PAY_TO is invalid. In Vercel, set it to your Base Ethereum wallet (0x + 40 hex) — not a Solana address."
      : isX402Enabled() && !evm
        ? "EVM payments unavailable — set a valid X402_EVM_PAY_TO on the server."
        : undefined,
    newsPerArticle: true,
    marketFeedFree: true,
    conciergePerChat: true,
  };
}
