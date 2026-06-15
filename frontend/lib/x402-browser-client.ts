/**
 * Browser x402 client — EVM (Base) + Solana USDC via connected Phantom/OKX wallets.
 */
import { x402Client } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { ClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { SolanaExactPhantomScheme } from "./x402-solana-phantom-scheme";
import { SolanaSelfSettleScheme } from "./x402-solana-self-scheme";
import {
  TOKEN_PAY_COMING_SOON_DEFAULT,
  TOKEN_PAY_DEFAULT_SYMBOL,
} from "./token-pay-client";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  publicActions,
  type EIP1193Provider,
} from "viem";
import { base, baseSepolia } from "viem/chains";

export const PRICE_ATOMIC = 100_000n;
const PRICE_USDC = 0.1;

/** @deprecated Use TOKEN_PAY_COMING_SOON_DEFAULT */
export const SOON_PAY_COMING_SOON = TOKEN_PAY_COMING_SOON_DEFAULT;

export type X402ServerPayConfig = {
  acceptsEvm?: boolean;
  acceptsSol?: boolean;
  evmPayToReady?: boolean;
  solPayToReady?: boolean;
  hasCustomSolRpc?: boolean;
  solPayTo?: string;
  evmPayTo?: string;
  solMerchantUsdcAta?: boolean | null;
  /** Token Pay (default merchant) */
  tokenPaySymbol?: string;
  acceptsTokenPaySol?: boolean;
  tokenPayMint?: string;
  tokenUsdcRate?: number;
  tokenConciergeAtomic?: string;
  solMerchantTokenAta?: boolean | null;
  tokenComingSoonMessage?: string;
  /** Legacy SOON field aliases */
  acceptsSoonSol?: boolean;
  soonMint?: string;
  soonUsdcRate?: number;
  soonConciergeAtomic?: string;
  solMerchantSoonAta?: boolean | null;
};

function tokenSymbol(serverConfig: X402ServerPayConfig): string {
  return serverConfig.tokenPaySymbol?.trim() || TOKEN_PAY_DEFAULT_SYMBOL;
}

function isTokenPayLive(serverConfig: X402ServerPayConfig): boolean {
  const mint = serverConfig.tokenPayMint || serverConfig.soonMint;
  const atomic = serverConfig.tokenConciergeAtomic || serverConfig.soonConciergeAtomic;
  const accepts = serverConfig.acceptsTokenPaySol ?? serverConfig.acceptsSoonSol;
  return !!(accepts && mint && atomic && serverConfig.solPayToReady);
}

function x402ChainsConfigured(serverConfig: X402ServerPayConfig): boolean {
  return !!(
    (serverConfig.acceptsEvm && serverConfig.evmPayToReady) ||
    (serverConfig.acceptsSol && serverConfig.solPayToReady)
  );
}

const USDC = {
  mainnet: {
    evm: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
    evmNetwork: "eip155:8453" as const,
    solMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    solNetwork: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const,
    /** Public RPC blocks browser POST (403) — use fallbacks first */
    solRpcFallbacks: [
      "https://solana-rpc.publicnode.com",
      "https://rpc.ankr.com/solana",
      "https://solana.drpc.org",
      "https://api.mainnet-beta.solana.com",
    ],
  },
  testnet: {
    evm: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
    evmNetwork: "eip155:84532" as const,
    solMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    solNetwork: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const,
    solRpcFallbacks: [
      "https://solana-devnet-rpc.publicnode.com",
      "https://rpc.ankr.com/solana_devnet",
      "https://api.devnet.solana.com",
    ],
  },
};

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type WalletSession = {
  evm?: { address: string; wallet: string } | null;
  sol?: { address: string; wallet: string } | null;
};

export type PayChain = "evm" | "sol" | "soon";

export type ChainPayOption = {
  chain: PayChain;
  label: string;
  sublabel: string;
  balanceUsdc: string;
  balanceAtomic: bigint;
  sufficient: boolean;
  available: boolean;
  balanceUnknown?: boolean;
  disabledReason?: string;
  /** Listed for visibility but not payable yet (pre-launch SOON). */
  comingSoon?: boolean;
};

export type X402PaidFetchOptions = {
  preferredChain?: PayChain;
};

type PhantomSolanaProvider = {
  signTransaction: (tx: unknown) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
    phantom?: { solana?: PhantomSolanaProvider };
    okxwallet?: { solana?: PhantomSolanaProvider };
    getX402PaymentOptions?: (
      session: WalletSession,
      networkMode?: "mainnet" | "testnet",
      serverConfig?: X402ServerPayConfig,
    ) => Promise<ChainPayOption[]>;
    createX402PaidFetch?: (
      session: WalletSession,
      networkMode?: "mainnet" | "testnet",
      serverConfig?: X402ServerPayConfig,
      options?: X402PaidFetchOptions,
    ) => Promise<typeof fetch>;
    isX402ChainPaymentReady?: (
      session: WalletSession,
      networkMode?: "mainnet" | "testnet",
      serverConfig?: X402ServerPayConfig,
      chain?: PayChain,
    ) => Promise<boolean>;
  }
}

const BASE_HTTP_RPC = {
  mainnet: "https://mainnet.base.org",
  testnet: "https://sepolia.base.org",
} as const;

function formatToken(atomic: bigint, symbol: string): string {
  const whole = atomic / 1_000_000n;
  return `${whole.toLocaleString("en-US")} ${symbol}`;
}

async function solTokenBalanceViaApi(
  owner: string,
  mint: string,
): Promise<{ balance: bigint; unknown: boolean }> {
  try {
    const res = await fetch(
      `/api/sol-usdc-balance?owner=${encodeURIComponent(owner)}&mint=${encodeURIComponent(mint)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as { balanceAtomic?: string | null; ok?: boolean };
    if (!res.ok || data.balanceAtomic == null) return { balance: 0n, unknown: true };
    return { balance: BigInt(data.balanceAtomic), unknown: false };
  } catch {
    return { balance: 0n, unknown: true };
  }
}

function formatUsdc(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const frac = atomic % 1_000_000n;
  if (frac === 0n) return `${whole} USDC`;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} USDC`;
}

function solRpcProxyUrl(): string {
  if (typeof window === "undefined") return "https://solana-rpc.publicnode.com";
  return `${window.location.origin}/api/solana-rpc`;
}

/** Public Solana RPC URLs blocked in browser (403) — redirect to our Helius proxy */
const SOLANA_PUBLIC_RPC_RE =
  /\/\/(?:api\.)?mainnet-beta\.solana\.com|\/\/api\.devnet\.solana\.com|\/\/api\.testnet\.solana\.com/i;

let solRpcProxyDepth = 0;
let nativeFetch: typeof fetch | null = null;

function installSolanaRpcProxyFetch(): void {
  if (typeof window === "undefined") return;
  if (!nativeFetch) nativeFetch = window.fetch.bind(window);
  if (solRpcProxyDepth++ > 0) return;
  const proxy = solRpcProxyUrl();
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (SOLANA_PUBLIC_RPC_RE.test(url)) {
      return nativeFetch!(proxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: init?.body,
        signal: init?.signal,
      });
    }
    return nativeFetch!(input, init);
  };
}

function uninstallSolanaRpcProxyFetch(): void {
  if (typeof window === "undefined" || !nativeFetch) return;
  if (--solRpcProxyDepth > 0) return;
  window.fetch = nativeFetch;
}

const BASE_MAINNET_CHAIN_ID = 8453;

async function ensureWalletOnBase(provider: EIP1193Provider): Promise<void> {
  const raw = await provider.request({ method: "eth_chainId" });
  const current =
    typeof raw === "string" ? parseInt(raw, 16) : typeof raw === "number" ? raw : 0;
  if (current === BASE_MAINNET_CHAIN_ID) return;

  const baseHex = "0x2105";
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseHex }],
    });
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/4902|unrecognized chain/i.test(msg)) {
      throw new Error(
        `Switch your wallet to Base network to pay (current chain id ${current}). ${msg}`,
      );
    }
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: baseHex,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://mainnet.base.org"],
        blockExplorerUrls: ["https://basescan.org"],
      },
    ],
  });
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: baseHex }],
  });
}

type ElPrivyBridge = {
  getEvmProvider?: () => EIP1193Provider | null;
  getSolanaSigner?: () => PhantomSolanaProvider | null;
};

function elPrivy(): ElPrivyBridge | undefined {
  return (window as Window & { __elPrivy?: ElPrivyBridge }).__elPrivy;
}

function privySolanaProvider(): PhantomSolanaProvider | null {
  return elPrivy()?.getSolanaSigner?.() ?? null;
}

function evmProviderForSession(session: WalletSession): EIP1193Provider | undefined {
  if (session.evm?.wallet === "privy") {
    return elPrivy()?.getEvmProvider?.() ?? undefined;
  }
  return window.ethereum;
}

function solanaProvider(session: WalletSession): PhantomSolanaProvider | null {
  const w = session.sol?.wallet;
  if (w === "privy") return privySolanaProvider();
  if (w === "phantom") return window.phantom?.solana ?? null;
  if (w === "okx") return window.okxwallet?.solana ?? null;
  return window.phantom?.solana ?? window.okxwallet?.solana ?? null;
}

async function evmUsdcBalance(
  userAddress: `0x${string}`,
  networkMode: "mainnet" | "testnet",
): Promise<bigint> {
  const nets = USDC[networkMode];
  const chain = networkMode === "testnet" ? baseSepolia : base;
  const client = createPublicClient({
    chain,
    transport: http(BASE_HTTP_RPC[networkMode]),
  });
  try {
    return await client.readContract({
      address: nets.evm,
      abi: erc20BalanceAbi,
      functionName: "balanceOf",
      args: [userAddress],
    });
  } catch {
    return 0n;
  }
}

type SolBalanceResult = { balance: bigint; unknown: boolean };

async function solUsdcBalanceViaRpc(
  rpcUrl: string,
  owner: string,
  mint: string,
): Promise<bigint | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [owner, { mint }, { encoding: "jsonParsed" }],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  if (data.error) return null;
  const value = (data.result as { value?: unknown[] } | undefined)?.value ?? [];
  let total = 0n;
  for (const row of value) {
    const acct = row as { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } };
    const amt = acct.account?.data?.parsed?.info?.tokenAmount?.amount;
    if (amt) total += BigInt(amt);
  }
  return total;
}

/** Server proxy — Helius blocks browser CORS; same-origin API uses Vercel env RPC */
async function solUsdcBalanceViaApi(owner: string): Promise<bigint | null> {
  try {
    const res = await fetch(
      `/api/sol-usdc-balance?owner=${encodeURIComponent(owner)}`,
      { cache: "no-store", signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { balanceAtomic?: string | null; ok?: boolean };
    if (!data.ok || data.balanceAtomic == null) return null;
    return BigInt(data.balanceAtomic);
  } catch {
    return null;
  }
}

async function solUsdcBalance(
  owner: string,
  networkMode: "mainnet" | "testnet",
  _customRpc?: string,
): Promise<SolBalanceResult> {
  const apiBal = await solUsdcBalanceViaApi(owner);
  if (apiBal !== null) return { balance: apiBal, unknown: false };

  const nets = USDC[networkMode];
  for (const rpc of nets.solRpcFallbacks) {
    try {
      const bal = await solUsdcBalanceViaRpc(rpc, owner, nets.solMint);
      if (bal !== null) return { balance: bal, unknown: false };
    } catch {
      /* try next RPC */
    }
  }
  return { balance: 0n, unknown: true };
}

/** Lists chains the user can pay on, with live USDC balances. */
export async function getPaymentChainOptions(
  session: WalletSession,
  networkMode: "mainnet" | "testnet" = "mainnet",
  serverConfig: X402ServerPayConfig = {},
): Promise<ChainPayOption[]> {
  const provider = evmProviderForSession(session);
  const options: ChainPayOption[] = [];

  if (serverConfig.acceptsEvm && serverConfig.evmPayToReady) {
    const hasWallet = !!session.evm?.address;
    let bal = 0n;
    let disabledReason: string | undefined;
    if (!hasWallet) {
      disabledReason = "Connect EVM (Ethereum on Base) in your wallet";
    } else if (!provider) {
      disabledReason =
        session.evm?.wallet === "privy"
          ? "Privy EVM wallet not ready — reconnect Privy"
          : "EVM provider not found — reopen Phantom/OKX";
    } else {
      bal = await evmUsdcBalance(session.evm!.address as `0x${string}`, networkMode);
    }
    const sufficient = bal >= PRICE_ATOMIC;
    options.push({
      chain: "evm",
      label: "Base (EVM)",
      sublabel: hasWallet ? shortAddr(session.evm!.address, "evm") : "Not connected",
      balanceUsdc: hasWallet && provider ? formatUsdc(bal) : "—",
      balanceAtomic: bal,
      sufficient,
      available: hasWallet && !!provider,
      disabledReason: disabledReason ?? (!sufficient && hasWallet ? `Need at least ${PRICE_USDC} USDC on Base` : undefined),
    });
  }

  if (serverConfig.acceptsSol && serverConfig.solPayToReady) {
    const hasWallet = !!session.sol?.address;
    const solProv = solanaProvider(session);
    let bal = 0n;
    let balanceUnknown = false;
    let disabledReason: string | undefined;
    if (!hasWallet) {
      disabledReason = "Connect Solana in your wallet";
    } else if (!solProv) {
      disabledReason =
        session.sol?.wallet === "privy"
          ? "Privy Solana wallet not ready — reconnect Privy"
          : "Solana provider not found — reopen Phantom/OKX";
    } else if (
      serverConfig.solPayTo &&
      session.sol!.address === serverConfig.solPayTo
    ) {
      disabledReason =
        "Merchant Solana address is your wallet — fix X402_SOL_PAY_TO in Vercel (use a different receive address)";
    } else {
      const solBal = await solUsdcBalance(session.sol!.address, networkMode);
      bal = solBal.balance;
      balanceUnknown = solBal.unknown;
      if (serverConfig.solMerchantUsdcAta === false) {
        disabledReason =
          "Merchant cannot receive USDC on Solana yet — send a tiny USDC once to the merchant address in Vercel, or pay with Base";
      }
    }
    const sufficient = balanceUnknown || bal >= PRICE_ATOMIC;
    options.push({
      chain: "sol",
      label: "Solana",
      sublabel: hasWallet ? shortAddr(session.sol!.address, "sol") : "Not connected",
      balanceUsdc: hasWallet && solProv
        ? balanceUnknown
          ? "Check wallet (RPC unavailable)"
          : formatUsdc(bal)
        : "—",
      balanceAtomic: bal,
      sufficient,
      balanceUnknown,
      available: hasWallet && !!solProv && !disabledReason?.includes("your wallet"),
      disabledReason:
        disabledReason ??
        (!sufficient && hasWallet && !balanceUnknown
          ? `Need at least ${PRICE_USDC} USDC on Solana`
          : undefined),
    });
  }

  if (isTokenPayLive(serverConfig)) {
    const sym = tokenSymbol(serverConfig);
    const mint = serverConfig.tokenPayMint || serverConfig.soonMint!;
    const hasWallet = !!session.sol?.address;
    const solProv = solanaProvider(session);
    const needAtomic = BigInt(
      serverConfig.tokenConciergeAtomic || serverConfig.soonConciergeAtomic!,
    );
    let bal = 0n;
    let balanceUnknown = false;
    let disabledReason: string | undefined;
    if (!hasWallet) {
      disabledReason = "Connect Solana in your wallet";
    } else if (!solProv) {
      disabledReason =
        session.sol?.wallet === "privy"
          ? "Privy Solana wallet not ready — reconnect Privy"
          : "Solana provider not found — reopen Phantom/OKX";
    } else if (
      (serverConfig.solMerchantTokenAta ?? serverConfig.solMerchantSoonAta) === false
    ) {
      disabledReason = `Merchant cannot receive ${sym} yet — send a tiny ${sym} once to the merchant wallet, or pay with USDC`;
    } else {
      const tokenBal = await solTokenBalanceViaApi(session.sol!.address, mint);
      bal = tokenBal.balance;
      balanceUnknown = tokenBal.unknown;
    }
    const sufficient = balanceUnknown || bal >= needAtomic;
    const rate =
      serverConfig.tokenUsdcRate ?? serverConfig.soonUsdcRate;
    const rateHint =
      rate && rate > 0
        ? `≈ ${PRICE_USDC} USDC · you pay SOL gas`
        : "Self-settle · you pay SOL gas";
    options.push({
      chain: "soon",
      label: sym,
      sublabel: rateHint,
      balanceUsdc: hasWallet && solProv
        ? balanceUnknown
          ? "Check wallet"
          : formatToken(bal, sym)
        : "—",
      balanceAtomic: bal,
      sufficient,
      balanceUnknown,
      available: hasWallet && !!solProv && !disabledReason,
      disabledReason:
        disabledReason ??
        (!sufficient && hasWallet && !balanceUnknown
          ? `Need at least ${formatToken(needAtomic, sym)} for this action`
          : undefined),
    });
  } else if (x402ChainsConfigured(serverConfig)) {
    const sym = tokenSymbol(serverConfig);
    options.push({
      chain: "soon",
      label: sym,
      sublabel: "Solana · pegged to USDC price",
      balanceUsdc: "—",
      balanceAtomic: 0n,
      sufficient: false,
      available: false,
      comingSoon: true,
      disabledReason:
        serverConfig.tokenComingSoonMessage || TOKEN_PAY_COMING_SOON_DEFAULT,
    });
  }

  return options;
}

function shortAddr(addr: string, chain: "evm" | "sol"): string {
  if (chain === "sol") return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  const a = addr.startsWith("0x") ? addr : `0x${addr}`;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function paymentRequirementsSelector(preferred: PayChain) {
  return (_version: number, accepts: PaymentRequirements[]) => {
    const sol = accepts.filter((a) => String(a.network).startsWith("solana:"));
    const evm = accepts.filter((a) => String(a.network).startsWith("eip155:"));
    const soon = sol.filter((a) => a.extra?.settlement === "self");
    const usdcSol = sol.filter((a) => a.extra?.settlement !== "self");
    if (preferred === "soon" && soon.length) return soon[0];
    if (preferred === "sol" && usdcSol.length) return usdcSol[0];
    if (preferred === "sol" && sol.length) return sol[0];
    if (preferred === "evm" && evm.length) return evm[0];
    return accepts[0];
  };
}

async function resolvePaymentChain(
  session: WalletSession,
  networkMode: "mainnet" | "testnet",
  server: X402ServerPayConfig,
  preferred?: PayChain,
  provider?: EIP1193Provider,
): Promise<PayChain> {
  if (preferred) {
    const opts = await getPaymentChainOptions(session, networkMode, server);
    const pick = opts.find((o) => o.chain === preferred);
    if (!pick?.available) throw new Error(pick?.disabledReason || "Selected chain is not available");
    if (!pick.sufficient && !pick.balanceUnknown) {
      throw new Error(pick.disabledReason || `Insufficient USDC on ${pick.label}`);
    }
    return preferred;
  }

  const opts = await getPaymentChainOptions(session, networkMode, server);
  const usable = opts.filter((o) => o.available && (o.sufficient || o.balanceUnknown));
  if (usable.length) {
    const soon = usable.find((o) => o.chain === "soon");
    const sol = usable.find((o) => o.chain === "sol");
    const evm = usable.find((o) => o.chain === "evm");
    if (soon?.sufficient && !sol?.sufficient && !evm?.sufficient) return "soon";
    if (sol?.sufficient && !evm?.sufficient) return "sol";
    if (evm?.sufficient && !sol?.sufficient) return "evm";
    return usable.sort((a, b) =>
      a.balanceAtomic >= b.balanceAtomic ? -1 : 1,
    )[0].chain;
  }
  const anyAvail = opts.find((o) => o.available);
  if (anyAvail) throw new Error(anyAvail.disabledReason || "Insufficient USDC");
  throw new Error(
    "Connect Solana and/or EVM (Base) in your wallet, or configure merchant receive addresses on the server.",
  );
}

export async function createX402PaidFetch(
  session: WalletSession,
  networkMode: "mainnet" | "testnet" = "mainnet",
  serverConfig: X402ServerPayConfig = {},
  options: X402PaidFetchOptions = {},
): Promise<typeof fetch> {
  const nets = USDC[networkMode];
  const provider = evmProviderForSession(session);
  const chain = networkMode === "testnet" ? baseSepolia : base;

  const preferred = await resolvePaymentChain(
    session,
    networkMode,
    serverConfig,
    options.preferredChain,
    provider,
  );

  const client = new x402Client(paymentRequirementsSelector(preferred));

  if (preferred === "evm") {
    if (!provider) throw new Error("EVM wallet not connected — connect Base (Ethereum) in your wallet");
    if (networkMode === "mainnet") {
      await ensureWalletOnBase(provider);
    }
    const userAddress = session.evm!.address as `0x${string}`;
    const walletClient = createWalletClient({
      account: userAddress,
      chain,
      transport: custom(provider!),
    }).extend(publicActions);
    const publicClient = createPublicClient({ chain, transport: custom(provider!) });
    const signer: ClientEvmSigner = {
      address: userAddress,
      signTypedData: (message) =>
        walletClient.signTypedData({
          account: userAddress,
          domain: message.domain as Parameters<typeof walletClient.signTypedData>[0]["domain"],
          types: message.types as Parameters<typeof walletClient.signTypedData>[0]["types"],
          primaryType: message.primaryType,
          message: message.message as Parameters<typeof walletClient.signTypedData>[0]["message"],
        }),
      readContract: (args) =>
        publicClient.readContract(args as Parameters<typeof publicClient.readContract>[0]),
    };
    registerExactEvmScheme(client, { signer, networks: [nets.evmNetwork] });
  } else if (preferred === "soon") {
    const solProv = solanaProvider(session)!;
    client.register(
      nets.solNetwork,
      new SolanaSelfSettleScheme(
        solProv as {
          signTransaction: (tx: import("@solana/web3.js").VersionedTransaction) => Promise<import("@solana/web3.js").VersionedTransaction>;
        },
        session.sol!.address,
        solRpcProxyUrl(),
      ),
    );
  } else {
    const solProv = solanaProvider(session)!;
    client.register(
      nets.solNetwork,
      new SolanaExactPhantomScheme(
        solProv as {
          signTransaction: (tx: import("@solana/web3.js").VersionedTransaction) => Promise<import("@solana/web3.js").VersionedTransaction>;
        },
        session.sol!.address,
        solRpcProxyUrl(),
      ),
    );
  }

  const paidFetch = wrapFetchWithPayment(fetch, client);
  if (preferred !== "sol" && preferred !== "soon") return paidFetch;

  return async (url, options) => {
    installSolanaRpcProxyFetch();
    try {
      return await paidFetch(url, options);
    } finally {
      uninstallSolanaRpcProxyFetch();
    }
  };
}

export async function isChainPaymentReady(
  session: WalletSession,
  networkMode: "mainnet" | "testnet" = "mainnet",
  serverConfig: X402ServerPayConfig = {},
  chain: PayChain,
): Promise<boolean> {
  const opts = await getPaymentChainOptions(session, networkMode, serverConfig);
  const pick = opts.find((o) => o.chain === chain);
  return !!(pick?.available && (pick.sufficient || pick.balanceUnknown));
}

if (typeof window !== "undefined") {
  window.getX402PaymentOptions = getPaymentChainOptions;
  window.createX402PaidFetch = createX402PaidFetch;
  window.isX402ChainPaymentReady = isChainPaymentReady;
}
