/**
 * Browser x402 client — EVM (Base) + Solana USDC via connected Phantom/OKX wallets.
 */
import { x402Client } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { ClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { address } from "@solana/addresses";
import { createNoopSigner, type TransactionSigner } from "@solana/signers";
import { getTransactionCodec, assertIsTransactionWithinSizeLimit } from "@solana/transactions";
import { VersionedTransaction } from "@solana/web3.js";
import {
  createPublicClient,
  createWalletClient,
  custom,
  publicActions,
  type EIP1193Provider,
} from "viem";
import { base, baseSepolia } from "viem/chains";

export const PRICE_ATOMIC = 100_000n;
const PRICE_USDC = 0.1;

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

export type X402ServerPayConfig = {
  acceptsEvm?: boolean;
  acceptsSol?: boolean;
  evmPayToReady?: boolean;
  solPayToReady?: boolean;
  /** Optional Helius/Alchemy RPC from Vercel SOLANA_RPC_URL */
  solRpcUrl?: string;
  /** Merchant receive addresses (public) */
  solPayTo?: string;
  evmPayTo?: string;
  /** false when merchant has never received USDC on Solana (ATA missing) */
  solMerchantUsdcAta?: boolean | null;
};

export type PayChain = "evm" | "sol";

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

function signedTxToBytes(signed: unknown, fallback: Uint8Array): Uint8Array {
  if (signed instanceof Uint8Array) return signed;
  if (signed instanceof VersionedTransaction) return signed.serialize();
  const obj = signed as {
    serialize?: () => Uint8Array;
    serializedTransaction?: Uint8Array;
  };
  if (typeof obj?.serialize === "function") return obj.serialize();
  if (obj?.serializedTransaction instanceof Uint8Array) return obj.serializedTransaction;
  return fallback;
}

/** Partial sign via Phantom — avoids Lighthouse extra instructions on full signTransaction */
function createPhantomSolanaSigner(
  provider: PhantomSolanaProvider,
  pubkey: string,
): TransactionSigner {
  const addr = address(pubkey);
  const base = createNoopSigner(addr);
  const transactionCodec = getTransactionCodec();

  return {
    ...base,
    async modifyAndSignTransactions(transactions, config) {
      const results = [];
      for (const transaction of transactions) {
        const wire = transactionCodec.encode(transaction);
        const vtx = VersionedTransaction.deserialize(wire);
        let signed: unknown;
        try {
          signed = await provider.signTransaction(vtx);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const code = (e as { code?: number })?.code;
          if (code === 4001 || /reject|cancel|denied/i.test(msg)) {
            throw new Error("Payment cancelled");
          }
          throw e;
        }
        const bytes = signedTxToBytes(signed, wire);
        const decoded = transactionCodec.decode(bytes);
        assertIsTransactionWithinSizeLimit(decoded);
        results.push(decoded);
      }
      return results;
    },
  };
}

function solanaProvider(session: WalletSession): PhantomSolanaProvider | null {
  const w = session.sol?.wallet;
  if (w === "phantom") return window.phantom?.solana ?? null;
  if (w === "okx") return window.okxwallet?.solana ?? null;
  return window.phantom?.solana ?? window.okxwallet?.solana ?? null;
}

async function evmUsdcBalance(
  userAddress: `0x${string}`,
  networkMode: "mainnet" | "testnet",
  provider: EIP1193Provider,
): Promise<bigint> {
  const nets = USDC[networkMode];
  const chain = networkMode === "testnet" ? baseSepolia : base;
  const client = createPublicClient({ chain, transport: custom(provider) });
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
  const provider = window.ethereum;
  const options: ChainPayOption[] = [];

  if (serverConfig.acceptsEvm && serverConfig.evmPayToReady) {
    const hasWallet = !!session.evm?.address;
    let bal = 0n;
    let disabledReason: string | undefined;
    if (!hasWallet) {
      disabledReason = "Connect EVM (Ethereum on Base) in your wallet";
    } else if (!provider) {
      disabledReason = "EVM provider not found — reopen Phantom/OKX";
    } else {
      bal = await evmUsdcBalance(session.evm!.address as `0x${string}`, networkMode, provider);
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
      disabledReason = "Solana provider not found — reopen Phantom/OKX";
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
  const provider = window.ethereum;
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
  } else {
    const solProv = solanaProvider(session)!;
    client.register(
      nets.solNetwork,
      new ExactSvmScheme(createPhantomSolanaSigner(solProv, session.sol!.address), {
        rpcUrl: solRpcProxyUrl(),
      }),
    );
  }

  const paidFetch = wrapFetchWithPayment(fetch, client);
  if (preferred !== "sol") return paidFetch;

  return async (url, options) => {
    installSolanaRpcProxyFetch();
    try {
      return await paidFetch(url, options);
    } finally {
      uninstallSolanaRpcProxyFetch();
    }
  };
}

if (typeof window !== "undefined") {
  window.getX402PaymentOptions = getPaymentChainOptions;
  window.createX402PaidFetch = createX402PaidFetch;
}
