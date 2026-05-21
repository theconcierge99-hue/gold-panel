/** Shared x402 / PayAI configuration (server + public config API). */

export const X402_PRICE_USDC = 0.1;
export const X402_PRICE_LABEL = "$0.10";
export const X402_PRICE_MONEY = "$0.10";

/** USDC atomic units (6 decimals): 0.1 USDC = 100_000 */
export const X402_PRICE_ATOMIC = "100000";

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
    evm: (process.env.X402_EVM_PAY_TO || "").trim() || null,
    sol: (process.env.X402_SOL_PAY_TO || "").trim() || null,
  };
}

/** When false, paid APIs are open (local dev). Set pay-to addresses to enable. */
export function isX402Enabled(): boolean {
  if (process.env.X402_ENABLED === "false") return false;
  if (process.env.X402_ENABLED === "true") return true;
  const { evm, sol } = getMerchantAddresses();
  return !!(evm || sol);
}

/** Public config for /api/x402-config — no @x402 SDK imports (Edge-safe). */
export function getPublicX402Config() {
  const nets = getX402NetworkProfile();
  const { evm, sol } = getMerchantAddresses();
  return {
    enabled: isX402Enabled(),
    facilitator: "PayAI",
    facilitatorUrl: "https://facilitator.payai.network",
    priceUsdc: X402_PRICE_USDC,
    priceLabel: X402_PRICE_LABEL,
    networks: nets,
    acceptsEvm: !!evm,
    acceptsSol: !!sol,
    newsPerArticle: true,
    marketFeedFree: true,
    conciergePerChat: true,
  };
}
