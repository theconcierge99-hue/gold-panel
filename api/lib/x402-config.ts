/** Shared x402 / PayAI configuration (server + public config API). */

import {
  addressEnvDiagnostics,
  cleanEnvAddress,
  normalizeEvmPayTo,
  normalizeSolPayTo,
} from "./x402-address";
import { merchantHasUsdcTokenAccount, normalizeSolanaRpcUrl } from "./x402-solana-rpc";

import {
  X402_READ_PRICE_ATOMIC,
  X402_READ_PRICE_USDC,
  X402_SIGNAL_PUBLISH_ATOMIC,
  X402_SIGNAL_PUBLISH_USDC,
} from "./x402-pricing";
import { discoveryMetaForConfig, resolveX402SiteOrigin } from "./x402-discovery";
import { creatorPayoutWalletsConfigured, solanaRwaMintConfigured } from "./creator-payout-env";
import {
  SIGNAL_CREATOR_SHARE_PERCENT,
  SIGNAL_MERCHANT_SHARE_PERCENT,
} from "./signal-revenue";

export const X402_PRICE_USDC = X402_READ_PRICE_USDC;
export const X402_PRICE_LABEL = "$0.10";
export const X402_PRICE_MONEY = "$0.10";

/** USDC atomic units (6 decimals): 0.1 USDC = 100_000 */
export const X402_PRICE_ATOMIC = X402_READ_PRICE_ATOMIC;

export { X402_SIGNAL_PUBLISH_USDC, X402_SIGNAL_PUBLISH_ATOMIC };

/** PayAI facilitator fee payer for Solana exact scheme */
export const SOLANA_FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

/** CAIP-2 Solana IDs — first 32 chars of genesis hash (x402 / @x402/svm requirement) */
export const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

const USDC_BY_NETWORK: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [SOLANA_MAINNET_CAIP2]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  [SOLANA_DEVNET_CAIP2]: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
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
  sol: SOLANA_MAINNET_CAIP2,
  label: "Base + Solana mainnet",
};

const TESTNET: X402NetworkProfile = {
  evm: "eip155:84532",
  sol: SOLANA_DEVNET_CAIP2,
  label: "Base Sepolia + Solana devnet",
};

export function getX402NetworkProfile(): X402NetworkProfile {
  const mode = (process.env.X402_NETWORK_MODE || "mainnet").toLowerCase();
  return mode === "testnet" ? TESTNET : MAINNET;
}

/** Vercel env names (also accepts common typo X402_*_PAY_ID) */
function rawEvmPayToEnv(): string | undefined {
  return process.env.X402_EVM_PAY_TO || process.env.X402_EVM_PAY_ID;
}

function rawSolPayToEnv(): string | undefined {
  return process.env.X402_SOL_PAY_TO || process.env.X402_SOL_PAY_ID;
}

export function getMerchantAddresses(): { evm: string | null; sol: string | null } {
  return {
    evm: normalizeEvmPayTo(rawEvmPayToEnv()),
    sol: normalizeSolPayTo(rawSolPayToEnv()),
  };
}

function hasRawEvmPayToEnv(): boolean {
  return !!cleanEnvAddress(rawEvmPayToEnv());
}

function hasRawSolPayToEnv(): boolean {
  return !!cleanEnvAddress(rawSolPayToEnv());
}

function evmMisconfigHint(): string | undefined {
  const raw = cleanEnvAddress(rawEvmPayToEnv());
  if (!raw) return undefined;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) && !raw.startsWith("0x")) {
    return "X402_EVM_PAY_TO looks like a Solana address — paste it into X402_SOL_PAY_TO instead, and put your Base (0x…) address here.";
  }
  if (raw.startsWith("0x") && raw.length > 42) {
    return "X402_EVM_PAY_TO is too long (tx hash?) — use your wallet receive address: 0x + 40 hex only.";
  }
  return undefined;
}

function solMisconfigHint(): string | undefined {
  const raw = cleanEnvAddress(rawSolPayToEnv());
  if (!raw) return undefined;
  if (raw.startsWith("0x")) {
    return "X402_SOL_PAY_TO looks like an EVM address — paste it into X402_EVM_PAY_TO, and put your Solana base58 address here.";
  }
  if (raw.length > 44) {
    return "X402_SOL_PAY_TO is too long — you may have pasted a private key or seed (never use secrets in Vercel). Use only your public Solana receive address from Phantom (Receive → Solana, ~44 characters).";
  }
  return undefined;
}

export function isSolPayToMisconfigured(): boolean {
  return hasRawSolPayToEnv() && !getMerchantAddresses().sol;
}

/** Payments active only when at least one valid merchant receive address exists */
export function isX402Enabled(): boolean {
  if (process.env.X402_ENABLED === "false") return false;
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
  const solEnvInvalid = isSolPayToMisconfigured();
  const payReady = !!(evm || sol);
  const wantsPay =
    process.env.X402_ENABLED === "true" ||
    hasRawEvmPayToEnv() ||
    hasRawSolPayToEnv();

  /** Shown when env vars exist but fail validation */
  const configWarning =
    wantsPay && !payReady
      ? "Merchant receive addresses invalid in Vercel — fix X402_EVM_PAY_TO (Base 0x…) and/or X402_SOL_PAY_TO (Solana)."
      : undefined;

  return {
    enabled: isX402Enabled(),
    paymentsRequested: wantsPay,
    facilitator: "PayAI",
    facilitatorUrl: "https://facilitator.payai.network",
    priceUsdc: X402_PRICE_USDC,
    priceLabel: X402_PRICE_LABEL,
    networks: nets,
    acceptsEvm: !!evm,
    acceptsSol: !!sol,
    evmPayToReady: !!evm,
    solPayToReady: !!sol,
    configWarning,
    evmConfigNote: evmEnvInvalid
      ? evmMisconfigHint() ||
        `X402_EVM_PAY_TO invalid (length ${cleanEnvAddress(rawEvmPayToEnv()).length}, need 0x + 40 hex). Phantom → Ethereum on Base → copy address.`
      : undefined,
    solConfigNote: solEnvInvalid
      ? solMisconfigHint() ||
        `X402_SOL_PAY_TO invalid (length ${cleanEnvAddress(rawSolPayToEnv()).length}, need Solana base58 32–44 chars). Phantom → Solana → copy address (not 0x).`
      : undefined,
    diagnostics: {
      evm: addressEnvDiagnostics(rawEvmPayToEnv()),
      sol: addressEnvDiagnostics(rawSolPayToEnv()),
      usesPayIdAlias:
        !!(process.env.X402_EVM_PAY_ID || process.env.X402_SOL_PAY_ID) &&
        !(process.env.X402_EVM_PAY_TO && process.env.X402_SOL_PAY_TO),
    },
    /** True when SOLANA_RPC_URL is set server-side (URL never exposed to clients) */
    hasCustomSolRpc: !!normalizeSolanaRpcUrl(process.env.SOLANA_RPC_URL),
    newsPerArticle: true,
    marketFeedFree: true,
    conciergePerChat: true,
    signalPublishUsdc: X402_SIGNAL_PUBLISH_USDC,
    signalOpenUsdc: X402_READ_PRICE_USDC,
    creatorSignalsEnabled: true,
    signalReaderRevenueShare: {
      creatorPercent: SIGNAL_CREATOR_SHARE_PERCENT,
      merchantPercent: SIGNAL_MERCHANT_SHARE_PERCENT,
      instantCreatorPayout: true,
      settledMonthly: false,
      note: "Publish fee (1 USDC) is 100% merchant; reader unlock (0.1 USDC) splits 50/50 — creator half sent on-chain to their wallet after each unlock when payout wallets are configured.",
    },
    creatorInstantPayoutReady: creatorPayoutWalletsConfigured(),
    rwaSignalsEnabled: true,
    readerBadgesEnabled: true,
    solanaRwaMintReady: solanaRwaMintConfigured(),
    discovery: discoveryMetaForConfig(resolveX402SiteOrigin()),
  };
}

export function getSolanaRpcUrlForServer(): string {
  return normalizeSolanaRpcUrl(process.env.SOLANA_RPC_URL) ?? "https://solana-rpc.publicnode.com";
}

/** Async public config — includes merchant USDC ATA readiness check */
export async function getPublicX402ConfigAsync() {
  const base = getPublicX402Config();
  const { evm, sol } = getMerchantAddresses();
  let solMerchantUsdcAta: boolean | null = null;
  if (sol) {
    try {
      solMerchantUsdcAta = await merchantHasUsdcTokenAccount(sol, getSolanaRpcUrlForServer());
    } catch {
      solMerchantUsdcAta = null;
    }
  }
  return {
    ...base,
    evmPayTo: evm ?? undefined,
    solPayTo: sol ?? undefined,
    solMerchantUsdcAta,
  };
}
