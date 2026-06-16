/** Shared x402 configuration (server + public config API). */

import {
  addressEnvDiagnostics,
  cleanEnvAddress,
  normalizeEvmPayTo,
  normalizeSolPayTo,
} from "./x402-address";
import { merchantHasTokenAccount, merchantHasUsdcTokenAccount, normalizeSolanaRpcUrl } from "./x402-solana-rpc";
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
  X402_READ_PRICE_ATOMIC,
  X402_READ_PRICE_USDC,
  X402_SIGNAL_PUBLISH_ATOMIC,
  X402_SIGNAL_PUBLISH_USDC,
} from "./x402-pricing";
import { discoveryMetaForConfig, resolveX402SiteOrigin } from "./x402-discovery";
import { isZauthProviderEnabled } from "./zauth";
import { creatorPayoutWalletsConfigured, solanaRwaMintConfigured } from "./creator-payout-env";
import { isPrivyEnabled } from "./privy-env";
import {
  SIGNAL_CREATOR_SHARE_PERCENT,
  SIGNAL_MERCHANT_SHARE_PERCENT,
} from "./signal-revenue";
import { getSolanaFeePayer, getX402FacilitatorProfile, getX402FacilitatorFallback } from "./x402-facilitator";
import { dexterDiscoveryLinks } from "./dexter-links";

export const X402_PRICE_USDC = X402_READ_PRICE_USDC;
export const X402_PRICE_LABEL = "$0.10";
export const X402_PRICE_MONEY = "$0.10";

/** USDC atomic units (6 decimals): 0.1 USDC = 100_000 */
export const X402_PRICE_ATOMIC = X402_READ_PRICE_ATOMIC;

export { X402_SIGNAL_PUBLISH_USDC, X402_SIGNAL_PUBLISH_ATOMIC };

/** Solana fee payer for the active x402 facilitator (Dexter or PayAI). */
export const SOLANA_FEE_PAYER = getSolanaFeePayer();

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

  const facilitator = getX402FacilitatorProfile();
  const fallback = getX402FacilitatorFallback();

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

/** dRPC/Ankr free endpoints block getLatestBlockhash from server/browser — avoid for mint + x402 */
function isUnreliablePublicSolRpc(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes("drpc.org")) return true;
    if (h === "rpc.ankr.com" || h.endsWith(".ankr.com")) return true;
  } catch {
    return false;
  }
  return false;
}

export function getSolanaRpcUrlForServer(): string {
  const fromEnv = normalizeSolanaRpcUrl(process.env.SOLANA_RPC_URL);
  if (fromEnv && !isUnreliablePublicSolRpc(fromEnv)) return fromEnv;
  return "https://solana-rpc.publicnode.com";
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

  return {
    ...base,
    evmPayTo: evm ?? undefined,
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
