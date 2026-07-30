/** Shared x402 configuration (server + public config API). */

import {
  addressEnvDiagnostics,
  cleanEnvAddress,
  normalizeEvmPayTo,
  normalizeSolPayTo,
} from "./x402-address";
import {
  listSolanaRpcUrls,
  merchantHasTokenAccount,
  merchantHasUsdcTokenAccount,
  normalizeSolanaRpcUrl,
} from "./x402-solana-rpc";
import {
  formatTokenPayUiFromAtomic,
  getDefaultTokenPayMerchant,
  getDefaultTokenPayMerchantId,
  getTokenPayPlatformMeta,
  getTokenPayUsdRateAsync,
  isTokenPayX402Live,
  listTokenPayMerchants,
  toPublicMerchant,
  tokenPayAtomicForResourceAsync,
  tokenPayAtomicForResourceSync,
} from "./token-pay";

import {
  X402_RAW_INTEL_KINDS,
  X402_RAW_PRICE_USDC,
  X402_BUNDLE_PRICE_USDC,
  X402_READ_PRICE_ATOMIC,
  X402_READ_PRICE_USDC,
  X402_SIGNAL_PUBLISH_ATOMIC,
  X402_SIGNAL_PUBLISH_USDC,
  X402_SIGNAL_PRICE_USDC,
} from "./x402-pricing";
import { discoveryMetaForConfig, resolveX402SiteOrigin } from "./x402-discovery";
import { isZauthProviderEnabled } from "./zauth";
import { publicCreatorPointsMeta } from "./creator-points";
import { solanaRwaMintConfigured } from "./rwa-mint-env";
import { isPrivyEnabled } from "./privy-env";
import {
  SIGNAL_CREATOR_SHARE_PERCENT,
  SIGNAL_MERCHANT_SHARE_PERCENT,
} from "./signal-revenue";
import {
  getSolanaFeePayer,
  getX402FacilitatorProfile,
  getX402FacilitatorFallback,
  getRobinhoodFacilitatorProfile,
  DEXTER_FACILITATOR,
} from "./x402-facilitator";
import { dexterDiscoveryLinks } from "./dexter-links";
import { isSoonLaunched, publicSoonHolderTiers, SOON_TIERS } from "./soon-token";

export const X402_PRICE_USDC = X402_READ_PRICE_USDC;
export const X402_PRICE_LABEL = "$0.02–$0.25";
export const X402_PRICE_MONEY = "$0.02–$0.25";

/** USDC atomic units (6 decimals): 0.1 USDC = 100_000 */
export const X402_PRICE_ATOMIC = X402_READ_PRICE_ATOMIC;

export { X402_SIGNAL_PUBLISH_USDC, X402_SIGNAL_PUBLISH_ATOMIC };

/** Solana fee payer for the active x402 facilitator (Dexter or PayAI). */
export const SOLANA_FEE_PAYER = getSolanaFeePayer();

/** CAIP-2 Solana IDs — first 32 chars of genesis hash (x402 / @x402/svm requirement) */
export const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

/** Robinhood Chain — Arbitrum Orbit L2 (USDG settlement, not Circle USDC). */
export const ROBINHOOD_MAINNET_CAIP2 = "eip155:4663" as const;
export const ROBINHOOD_TESTNET_CAIP2 = "eip155:46630" as const;
/** Paxos Global Dollar (USDG) on Robinhood Chain mainnet — 6 decimals, EIP-3009. */
export const ROBINHOOD_USDG_MAINNET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/** BNB Smart Chain — Binance-Peg stablecoins via Permit2 (Dexter). Mainnet only. */
export const BNB_MAINNET_CAIP2 = "eip155:56" as const;
/** Binance-Peg USDT (BSC-USD) — 18 decimals, no EIP-3009/EIP-2612 (verified on-chain). */
export const BNB_USDT_MAINNET = "0x55d398326f99059fF775485246999027B3197955";
/** Binance-Peg USDC — 18 decimals, no EIP-3009/EIP-2612 (verified on-chain). */
export const BNB_USDC_MAINNET = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
/** Both Binance-Peg stablecoins use 18 decimals, not the 6 used by Circle USDC. */
export const BNB_STABLE_DECIMALS = 18;
/** @deprecated Use BNB_STABLE_DECIMALS — both BSC assets share the same decimals. */
export const BNB_USDT_DECIMALS = BNB_STABLE_DECIMALS;

export type X402AssetTransferMethod = "eip3009" | "permit2";

export type X402SettlementAssetProfile = {
  network: string;
  asset: string;
  symbol: string;
  decimals: number;
  transferMethod: X402AssetTransferMethod;
  /** EIP-712 token domain — required for EIP-3009; optional hint for Permit2. */
  eip712?: { name: string; version: string };
};

const USDC_BY_NETWORK: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "eip155:42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "eip155:421614": "0x75faf114eafb1BDbe2F6496Ed7E7eD0Eb74e2Da",
  [SOLANA_MAINNET_CAIP2]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  [SOLANA_DEVNET_CAIP2]: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

export function isRobinhoodNetwork(network: string): boolean {
  return network === ROBINHOOD_MAINNET_CAIP2 || network === ROBINHOOD_TESTNET_CAIP2;
}

export function isBnbNetwork(network: string): boolean {
  return network === BNB_MAINNET_CAIP2;
}

/** Primary settlement asset for a CAIP-2 network (USDC, Robinhood USDG, or BNB USDT). */
export function getUsdcAssetForNetwork(network: string): string {
  return getSettlementAssetProfile(network).asset;
}

export function getRobinhoodUsdgAsset(network: string): string | null {
  if (network === ROBINHOOD_MAINNET_CAIP2) {
    return (
      cleanEnvAddress(process.env.X402_ROBINHOOD_USDG) || ROBINHOOD_USDG_MAINNET
    );
  }
  if (network === ROBINHOOD_TESTNET_CAIP2) {
    // Testnet USDG mint is not the mainnet address — require explicit env.
    return cleanEnvAddress(process.env.X402_ROBINHOOD_USDG) || null;
  }
  return null;
}

export function getBnbUsdtAsset(network: string): string | null {
  if (network !== BNB_MAINNET_CAIP2) return null;
  return cleanEnvAddress(process.env.X402_BNB_USDT) || BNB_USDT_MAINNET;
}

export function getBnbUsdcAsset(network: string): string | null {
  if (network !== BNB_MAINNET_CAIP2) return null;
  if (process.env.X402_BNB_USDC_ENABLED === "false") return null;
  return cleanEnvAddress(process.env.X402_BNB_USDC) || BNB_USDC_MAINNET;
}

function bnbAssetProfile(
  network: string,
  asset: string,
  symbol: "USDT" | "USDC",
  eip712Name: string,
): X402SettlementAssetProfile {
  return {
    network,
    asset,
    symbol,
    decimals: BNB_STABLE_DECIMALS,
    transferMethod: "permit2",
    // Permit2 signs over its own domain, so the token domain is only a client hint.
    eip712: { name: eip712Name, version: "1" },
  };
}

/** Full settlement profile — decimals + transfer method for multi-rail accepts. */
export function getSettlementAssetProfile(network: string): X402SettlementAssetProfile {
  if (isRobinhoodNetwork(network)) {
    const usdg = getRobinhoodUsdgAsset(network);
    if (!usdg) throw new Error(`Robinhood USDG not configured for ${network}`);
    return {
      network,
      asset: usdg,
      symbol: "USDG",
      decimals: 6,
      transferMethod: "eip3009",
      eip712: { name: "Global Dollar", version: "1" },
    };
  }
  if (isBnbNetwork(network)) {
    const profiles = getSettlementAssetProfiles(network);
    if (!profiles.length) throw new Error(`BNB stablecoin not configured for ${network}`);
    return profiles[0];
  }
  const asset = USDC_BY_NETWORK[network];
  if (!asset) throw new Error(`Unsupported x402 network: ${network}`);
  const eip712 =
    network === "eip155:84532" || network === "eip155:421614"
      ? { name: "USDC", version: "2" }
      : network.startsWith("eip155:")
        ? { name: "USD Coin", version: "2" }
        : { name: "USDC", version: "2" };
  return {
    network,
    asset,
    symbol: "USDC",
    decimals: 6,
    transferMethod: network.startsWith("eip155:") ? "eip3009" : "eip3009",
    eip712,
  };
}

/**
 * Every settlement asset advertised for a network.
 * BNB carries two Binance-Peg stablecoins (USDT + USDC) so a buyer can pay with
 * whichever it already holds; both settle through the same Dexter Permit2 path.
 * All other rails have exactly one asset.
 */
export function getSettlementAssetProfiles(network: string): X402SettlementAssetProfile[] {
  if (!isBnbNetwork(network)) return [getSettlementAssetProfile(network)];
  const profiles: X402SettlementAssetProfile[] = [];
  const usdt = getBnbUsdtAsset(network);
  if (usdt) profiles.push(bnbAssetProfile(network, usdt, "USDT", "Tether USD"));
  const usdc = getBnbUsdcAsset(network);
  if (usdc) profiles.push(bnbAssetProfile(network, usdc, "USDC", "USD Coin"));
  return profiles;
}

/**
 * Accept `extra` for one settlement asset.
 * EIP-3009 needs the token EIP-712 name/version; Permit2 signals assetTransferMethod
 * so upstream `@x402/evm` routes a PermitWitnessTransferFrom payload instead.
 */
export function getAcceptExtraForAsset(
  profile: X402SettlementAssetProfile,
): Record<string, unknown> {
  if (profile.transferMethod === "permit2") {
    return {
      assetTransferMethod: "permit2",
      ...(profile.eip712 ?? {}),
    };
  }
  return profile.eip712 ?? { name: "USDC", version: "2" };
}

/** Accept `extra` for a network's primary asset. Prefer getAcceptExtraForAsset. */
export function getAcceptExtraForNetwork(network: string): Record<string, unknown> {
  return getAcceptExtraForAsset(getSettlementAssetProfile(network));
}

/** @deprecated Prefer getAcceptExtraForNetwork — kept for callers expecting EIP-712 only. */
export function getUsdcEip712ExtraForNetwork(network: string): { name: string; version: string } {
  const profile = getSettlementAssetProfile(network);
  return profile.eip712 ?? { name: "USDC", version: "2" };
}

export type X402NetworkProfile = {
  evm: `eip155:${number}`;
  arbitrum: `eip155:${number}`;
  robinhood: `eip155:${number}`;
  /** BNB Smart Chain mainnet — only present when mode is mainnet. */
  bnb: `eip155:${number}` | null;
  sol: `solana:${string}`;
  label: string;
};

const MAINNET: X402NetworkProfile = {
  evm: "eip155:8453",
  arbitrum: "eip155:42161",
  robinhood: ROBINHOOD_MAINNET_CAIP2,
  bnb: BNB_MAINNET_CAIP2,
  sol: SOLANA_MAINNET_CAIP2,
  label: "Base + Arbitrum + Robinhood + BNB + Solana mainnet",
};

const TESTNET: X402NetworkProfile = {
  evm: "eip155:84532",
  arbitrum: "eip155:421614",
  robinhood: ROBINHOOD_TESTNET_CAIP2,
  // No verified BNB testnet facilitator/asset — never advertise eip155:97.
  bnb: null,
  sol: SOLANA_DEVNET_CAIP2,
  label: "Base Sepolia + Arbitrum Sepolia + Robinhood testnet + Solana devnet",
};

export function getX402NetworkProfile(): X402NetworkProfile {
  const mode = (process.env.X402_NETWORK_MODE || "mainnet").toLowerCase();
  return mode === "testnet" ? TESTNET : MAINNET;
}

/** Arbitrum rail — on when a payTo resolves for Arbitrum unless explicitly disabled. */
export function isArbitrumX402Enabled(): boolean {
  if (process.env.X402_ARBITRUM_ENABLED === "false") return false;
  const profile = getX402NetworkProfile();
  return !!getEvmPayToForNetwork(profile.arbitrum);
}

/**
 * Robinhood Chain USDG rail — on when a payTo resolves unless disabled.
 * Testnet requires X402_ROBINHOOD_USDG (mainnet mint is not deployed on 46630).
 */
export function isRobinhoodX402Enabled(): boolean {
  if (process.env.X402_ROBINHOOD_ENABLED === "false") return false;
  const profile = getX402NetworkProfile();
  if (!getEvmPayToForNetwork(profile.robinhood)) return false;
  return !!getRobinhoodUsdgAsset(profile.robinhood);
}

/**
 * BNB Smart Chain stablecoin rail (USDT + USDC) — fail-closed.
 * Requires explicit X402_BNB_ENABLED=true, mainnet mode, and a resolvable EVM payTo.
 * Settles only via Dexter (Permit2); PayAI/CDP do not support eip155:56.
 */
export function isBnbX402Enabled(): boolean {
  if (process.env.X402_BNB_ENABLED !== "true") return false;
  const profile = getX402NetworkProfile();
  if (!profile.bnb || !getEvmPayToForNetwork(profile.bnb)) return false;
  return getSettlementAssetProfiles(profile.bnb).length > 0;
}

/** EVM networks advertised in 402 accepts (Base + optional Arbitrum / Robinhood / BNB). */
export function getX402EvmAcceptNetworks(): Array<`eip155:${number}`> {
  const profile = getX402NetworkProfile();
  const nets: Array<`eip155:${number}`> = [];
  if (getEvmPayToForNetwork(profile.evm)) nets.push(profile.evm);
  if (isArbitrumX402Enabled()) nets.push(profile.arbitrum);
  if (isRobinhoodX402Enabled()) nets.push(profile.robinhood);
  if (isBnbX402Enabled() && profile.bnb) nets.push(profile.bnb);
  return nets;
}

/** Vercel env names (also accepts common typo X402_*_PAY_ID) */
function rawEvmPayToEnv(): string | undefined {
  return process.env.X402_EVM_PAY_TO || process.env.X402_EVM_PAY_ID;
}

/** Shared receive wallet for Arbitrum / Robinhood / BNB when Phantom (Base-only) is primary. */
function rawEvmAltPayToEnv(): string | undefined {
  return process.env.X402_EVM_ALT_PAY_TO || process.env.X402_EVM_ALT_PAY_ID;
}

function rawArbitrumPayToEnv(): string | undefined {
  return process.env.X402_ARBITRUM_PAY_TO || process.env.X402_ARBITRUM_PAY_ID;
}

function rawRobinhoodPayToEnv(): string | undefined {
  return process.env.X402_ROBINHOOD_PAY_TO || process.env.X402_ROBINHOOD_PAY_ID;
}

function rawBnbPayToEnv(): string | undefined {
  return process.env.X402_BNB_PAY_TO || process.env.X402_BNB_PAY_ID;
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

/**
 * Resolve merchant EVM receive address for a CAIP-2 network.
 * Base always uses X402_EVM_PAY_TO (Phantom).
 * Arbitrum / Robinhood / BNB: network-specific → X402_EVM_ALT_PAY_TO → X402_EVM_PAY_TO.
 */
export function getEvmPayToForNetwork(network: string): string | null {
  const profile = getX402NetworkProfile();
  const primary = normalizeEvmPayTo(rawEvmPayToEnv());
  const alt = normalizeEvmPayTo(rawEvmAltPayToEnv());

  if (network === profile.evm) return primary;
  if (network === profile.arbitrum) {
    return normalizeEvmPayTo(rawArbitrumPayToEnv()) || alt || primary;
  }
  if (network === profile.robinhood) {
    return normalizeEvmPayTo(rawRobinhoodPayToEnv()) || alt || primary;
  }
  if (profile.bnb && network === profile.bnb) {
    return normalizeEvmPayTo(rawBnbPayToEnv()) || alt || primary;
  }
  return primary;
}

/** Distinct EVM receive wallets currently advertised (for ownership proofs / config). */
export function listEvmMerchantPayTos(): string[] {
  const seen = new Set<string>();
  for (const network of getX402EvmAcceptNetworks()) {
    const payTo = getEvmPayToForNetwork(network);
    if (payTo) seen.add(payTo);
  }
  return [...seen];
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
  if (evm || sol) return true;
  return !!(
    normalizeEvmPayTo(rawEvmAltPayToEnv()) ||
    normalizeEvmPayTo(rawArbitrumPayToEnv()) ||
    normalizeEvmPayTo(rawRobinhoodPayToEnv()) ||
    normalizeEvmPayTo(rawBnbPayToEnv())
  );
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
  const payReady = !!(evm || sol || normalizeEvmPayTo(rawEvmAltPayToEnv()));
  const wantsPay =
    process.env.X402_ENABLED === "true" ||
    hasRawEvmPayToEnv() ||
    hasRawSolPayToEnv() ||
    !!cleanEnvAddress(rawEvmAltPayToEnv()) ||
    !!cleanEnvAddress(rawArbitrumPayToEnv()) ||
    !!cleanEnvAddress(rawRobinhoodPayToEnv()) ||
    !!cleanEnvAddress(rawBnbPayToEnv());

  /** Shown when env vars exist but fail validation */
  const configWarning =
    wantsPay && !payReady
      ? "Merchant receive addresses invalid in Vercel — fix X402_EVM_PAY_TO (Base 0x…) and/or X402_SOL_PAY_TO (Solana)."
      : undefined;

  const facilitator = getX402FacilitatorProfile();
  const fallback = getX402FacilitatorFallback();
  const robinhoodFacilitator = isRobinhoodX402Enabled() ? getRobinhoodFacilitatorProfile() : null;
  const bnbEnabled = isBnbX402Enabled();
  const arbEnabled = isArbitrumX402Enabled();
  const rhEnabled = isRobinhoodX402Enabled();
  const altEvm = normalizeEvmPayTo(rawEvmAltPayToEnv());
  const arbitrumPayTo = arbEnabled ? getEvmPayToForNetwork(nets.arbitrum) : null;
  const robinhoodPayTo = rhEnabled ? getEvmPayToForNetwork(nets.robinhood) : null;
  const bnbPayTo = bnbEnabled && nets.bnb ? getEvmPayToForNetwork(nets.bnb) : null;

  return {
    enabled: isX402Enabled(),
    paymentsRequested: wantsPay,
    facilitator: facilitator.name,
    facilitatorId: facilitator.id,
    facilitatorUrl: facilitator.url,
    facilitatorDocsUrl: facilitator.docsUrl,
    fallbackFacilitator: fallback.name,
    fallbackFacilitatorId: fallback.id,
    fallbackFacilitatorUrl: fallback.url,
    fallbackFacilitatorDocsUrl: fallback.docsUrl,
    priceUsdc: X402_PRICE_USDC,
    priceLabel: X402_PRICE_LABEL,
    networks: nets,
    acceptsEvm: !!evm,
    acceptsArbitrum: arbEnabled,
    acceptsRobinhood: rhEnabled,
    acceptsBnb: bnbEnabled,
    robinhoodNetwork: rhEnabled ? nets.robinhood : undefined,
    robinhoodUsdg: rhEnabled
      ? getRobinhoodUsdgAsset(nets.robinhood) ?? undefined
      : undefined,
    robinhoodFacilitator: robinhoodFacilitator?.name,
    robinhoodFacilitatorUrl: robinhoodFacilitator?.url,
    robinhoodFacilitatorDocsUrl: robinhoodFacilitator?.docsUrl,
    bnbNetwork: bnbEnabled ? nets.bnb ?? undefined : undefined,
    bnbUsdt: bnbEnabled && nets.bnb ? getBnbUsdtAsset(nets.bnb) ?? undefined : undefined,
    bnbUsdc: bnbEnabled && nets.bnb ? getBnbUsdcAsset(nets.bnb) ?? undefined : undefined,
    bnbUsdtDecimals: bnbEnabled ? BNB_STABLE_DECIMALS : undefined,
    bnbStableDecimals: bnbEnabled ? BNB_STABLE_DECIMALS : undefined,
    bnbFacilitator: bnbEnabled ? DEXTER_FACILITATOR.name : undefined,
    bnbFacilitatorUrl: bnbEnabled ? DEXTER_FACILITATOR.url : undefined,
    bnbFacilitatorDocsUrl: bnbEnabled ? DEXTER_FACILITATOR.docsUrl : undefined,
    bnbAssetTransferMethod: bnbEnabled ? "permit2" : undefined,
    evmNetworks: getX402EvmAcceptNetworks(),
    acceptsSol: !!sol,
    evmPayToReady: !!evm,
    evmAltPayToReady: !!altEvm,
    arbitrumPayToReady: !!arbitrumPayTo,
    robinhoodPayToReady: !!robinhoodPayTo,
    bnbPayToReady: !!bnbPayTo,
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
      evmAlt: addressEnvDiagnostics(rawEvmAltPayToEnv()),
      arbitrum: addressEnvDiagnostics(rawArbitrumPayToEnv()),
      robinhood: addressEnvDiagnostics(rawRobinhoodPayToEnv()),
      bnb: addressEnvDiagnostics(rawBnbPayToEnv()),
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
    pricingTiers: {
      rawUsdc: X402_RAW_PRICE_USDC,
      signalUsdc: X402_SIGNAL_PRICE_USDC,
      bundleUsdc: X402_BUNDLE_PRICE_USDC,
      rawIntelKinds: [...X402_RAW_INTEL_KINDS],
    },
    soonHolderFreeTier: {
      enabled: process.env.SOON_HOLDER_FREE_TIER_ENABLED !== "false" && isSoonLaunched(),
      walletHeader: "X-Soon-Holder-Wallet",
      freeRawPerDay: Number(process.env.SOON_HOLDER_FREE_RAW_PER_DAY ?? "5") || 5,
      minHoldUi: Number(process.env.SOON_HOLDER_MIN_TOKENS ?? String(SOON_TIERS[0]?.minHold ?? 1_000_000)) || SOON_TIERS[0]?.minHold || 1_000_000,
      note: "POST raw-tier intel with X-Soon-Holder-Wallet when TCX mint is live — no x402 if Deluxe tier+ balance.",
    },
    soonHolderTiers: publicSoonHolderTiers(),
    mcpEndpoint: "/api/mcp",
    intelAccuracyEndpoint: "/api/concierge-intel-accuracy",
    creatorSignalsEnabled: true,
    signalReaderRevenueShare: {
      creatorPercent: SIGNAL_CREATOR_SHARE_PERCENT,
      merchantPercent: SIGNAL_MERCHANT_SHARE_PERCENT,
      instantCreatorPayout: false,
      settledMonthly: false,
      note: "No USDC revenue share — creators earn Lounge points on publish and each reader unlock. Reader unlock (0.1 USDC) is 100% protocol.",
    },
    creatorPoints: publicCreatorPointsMeta(),
    rwaSignalsEnabled: true,
    readerBadgesEnabled: true,
    solanaRwaMintReady: solanaRwaMintConfigured(),
    discovery: discoveryMetaForConfig(resolveX402SiteOrigin()),
    dexter: dexterDiscoveryLinks(resolveX402SiteOrigin()),
    zauthTelemetryEnabled: isZauthProviderEnabled(),
    privyWalletEnabled: isPrivyEnabled(),
    tokenPay: {
      platform: getTokenPayPlatformMeta(),
      defaultMerchantId: getDefaultTokenPayMerchantId(),
      merchants: listTokenPayMerchants().map(toPublicMerchant),
      default: (() => {
        const m = getDefaultTokenPayMerchant();
        return {
          id: m.id,
          symbol: m.symbol,
          name: m.name,
          mint: m.mint,
          decimals: m.decimals,
          live: isTokenPayX402Live(m),
          comingSoonMessage: m.comingSoonMessage,
          conciergeAtomic: tokenPayAtomicForResourceSync(X402_READ_PRICE_USDC, m),
        };
      })(),
    },
    /** @deprecated Use tokenPay — kept for existing Lounge clients */
    soonX402: (() => {
      const m = getDefaultTokenPayMerchant();
      const atomic = tokenPayAtomicForResourceSync(X402_READ_PRICE_USDC, m);
      return {
        enabled: isTokenPayX402Live(m),
        mint: m.mint,
        decimals: m.decimals,
        priceSource: m.price.source,
        usdcRate: m.price.fallbackUsd,
        conciergeAtomic: atomic,
        conciergeLabel: atomic ? formatTokenPayUiFromAtomic(atomic, m) : undefined,
        note: "See tokenPay — set SOON_TOKEN_MINT after launch.",
      };
    })(),
  };
}

export function getSolanaRpcUrlForServer(): string {
  return listSolanaRpcUrls()[0];
}

/** Async public config — includes merchant USDC ATA readiness check */
export async function getPublicX402ConfigAsync() {
  const base = getPublicX402Config();
  const { evm, sol } = getMerchantAddresses();
  const defaultMerchant = getDefaultTokenPayMerchant();
  const rpc = getSolanaRpcUrlForServer();

  let solMerchantUsdcAta: boolean | null = null;
  if (sol) {
    try {
      solMerchantUsdcAta = await merchantHasUsdcTokenAccount(sol, rpc);
    } catch {
      solMerchantUsdcAta = null;
    }
  }

  const enrichedMerchants = await Promise.all(
    listTokenPayMerchants().map(async (m) => {
      const publicM = toPublicMerchant(m);
      const payTo = (m.payTo ?? sol ?? "").trim() || null;
      let merchantTokenAta: boolean | null = null;
      if (payTo && m.mint && isTokenPayX402Live(m)) {
        try {
          merchantTokenAta = await merchantHasTokenAccount(payTo, m.mint, rpc);
        } catch {
          merchantTokenAta = null;
        }
      }
      const tokenPrice = isTokenPayX402Live(m) ? await getTokenPayUsdRateAsync(m) : null;
      const tokenAtomic =
        tokenPrice != null
          ? await tokenPayAtomicForResourceAsync(X402_READ_PRICE_USDC, m)
          : null;
      return {
        ...publicM,
        payToReady: !!(payTo && m.mint && isTokenPayX402Live(m)),
        merchantTokenAta,
        usdcRate: tokenPrice?.usd,
        priceSource: tokenPrice?.source,
        conciergeAtomic: tokenAtomic ?? undefined,
        conciergeLabel:
          tokenAtomic != null ? formatTokenPayUiFromAtomic(tokenAtomic, m) : undefined,
      };
    }),
  );

  const liveMerchants = enrichedMerchants.filter((m) => m.live && m.conciergeAtomic);
  const defaultEnriched =
    enrichedMerchants.find((m) => m.id === defaultMerchant.id) ?? enrichedMerchants[0];
  const anyTokenPayLive = liveMerchants.length > 0;

  const nets = getX402NetworkProfile();
  return {
    ...base,
    evmPayTo: evm ?? undefined,
    evmAltPayTo: normalizeEvmPayTo(rawEvmAltPayToEnv()) ?? undefined,
    arbitrumPayTo: isArbitrumX402Enabled()
      ? getEvmPayToForNetwork(nets.arbitrum) ?? undefined
      : undefined,
    robinhoodPayTo: isRobinhoodX402Enabled()
      ? getEvmPayToForNetwork(nets.robinhood) ?? undefined
      : undefined,
    bnbPayTo:
      isBnbX402Enabled() && nets.bnb
        ? getEvmPayToForNetwork(nets.bnb) ?? undefined
        : undefined,
    solPayTo: sol ?? undefined,
    solMerchantUsdcAta,
    acceptsTokenPaySol: anyTokenPayLive && !!sol,
    acceptsSoonSol: anyTokenPayLive && !!sol,
    solMerchantTokenAta: defaultEnriched?.merchantTokenAta ?? null,
    solMerchantSoonAta: defaultEnriched?.merchantTokenAta ?? null,
    tokenPayMint: defaultEnriched?.mint,
    soonMint: defaultEnriched?.mint,
    tokenPaySymbol: defaultEnriched?.symbol ?? defaultMerchant.symbol,
    tokenUsdcRate: defaultEnriched?.usdcRate,
    soonUsdcRate: defaultEnriched?.usdcRate,
    tokenPriceSource: defaultEnriched?.priceSource,
    soonPriceSource: defaultEnriched?.priceSource,
    tokenConciergeAtomic: defaultEnriched?.conciergeAtomic,
    soonConciergeAtomic: defaultEnriched?.conciergeAtomic,
    tokenConciergeLabel: defaultEnriched?.conciergeLabel,
    soonConciergeLabel: defaultEnriched?.conciergeLabel,
    tokenPay: {
      ...base.tokenPay,
      liveMerchantCount: liveMerchants.length,
      merchants: enrichedMerchants,
      default: defaultEnriched
        ? {
            id: defaultEnriched.id,
            symbol: defaultEnriched.symbol,
            name: defaultEnriched.name,
            mint: defaultEnriched.mint,
            decimals: defaultEnriched.decimals,
            live: defaultEnriched.live,
            comingSoonMessage: defaultEnriched.comingSoonMessage,
            conciergeAtomic: defaultEnriched.conciergeAtomic,
            conciergeLabel: defaultEnriched.conciergeLabel,
            merchantTokenAta: defaultEnriched.merchantTokenAta,
          }
        : base.tokenPay.default,
    },
  };
}
