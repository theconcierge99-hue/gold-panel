/**
 * Browser x402 client — EVM (Base) + Solana USDC via connected Phantom/OKX wallets.
 * Picks the chain where the user has enough USDC (≥ 0.1) when both are available.
 */
import { x402Client } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { ClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { address } from "@solana/addresses";
import { getTransactionCodec, assertIsTransactionWithinSizeLimit } from "@solana/transactions";
import type { TransactionModifyingSigner } from "@solana/signers";
import {
  createPublicClient,
  createWalletClient,
  custom,
  publicActions,
  type EIP1193Provider,
} from "viem";
import { base, baseSepolia } from "viem/chains";

const PRICE_ATOMIC = 100_000n;

const USDC = {
  mainnet: {
    evm: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
    evmNetwork: "eip155:8453" as const,
    solMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    solNetwork: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" as const,
    solRpc: "https://api.mainnet-beta.solana.com",
  },
  testnet: {
    evm: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
    evmNetwork: "eip155:84532" as const,
    solMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    solNetwork: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const,
    solRpc: "https://api.devnet.solana.com",
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
};

type PhantomSolanaProvider = {
  signTransaction: (tx: Uint8Array) => Promise<Uint8Array | { serializedTransaction?: Uint8Array }>;
};

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
    phantom?: { solana?: PhantomSolanaProvider };
    okxwallet?: { solana?: PhantomSolanaProvider };
    createX402PaidFetch?: (
      session: WalletSession,
      networkMode?: "mainnet" | "testnet",
      serverConfig?: X402ServerPayConfig,
    ) => Promise<typeof fetch>;
  }
}

function solanaProvider(session: WalletSession): PhantomSolanaProvider | null {
  const w = session.sol?.wallet;
  if (w === "phantom") return window.phantom?.solana ?? null;
  if (w === "okx") return window.okxwallet?.solana ?? null;
  return window.phantom?.solana ?? window.okxwallet?.solana ?? null;
}

function createPhantomSolanaSigner(
  provider: PhantomSolanaProvider,
  pubkey: string,
): TransactionModifyingSigner<string> {
  const transactionCodec = getTransactionCodec();
  const addr = address(pubkey);

  return {
    address: addr,
    async modifyAndSignTransactions(transactions, config = {}) {
      config;
      const results = [];
      for (const transaction of transactions) {
        const wire = transactionCodec.encode(transaction);
        const signed = await provider.signTransaction(wire);
        const bytes =
          signed instanceof Uint8Array
            ? signed
            : (signed.serializedTransaction ?? wire);
        const decoded = transactionCodec.decode(bytes);
        assertIsTransactionWithinSizeLimit(decoded);
        results.push(decoded);
      }
      return results;
    },
  };
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

async function solUsdcBalance(
  owner: string,
  networkMode: "mainnet" | "testnet",
): Promise<bigint> {
  const nets = USDC[networkMode];
  try {
    const res = await fetch(nets.solRpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [owner, { mint: nets.solMint }, { encoding: "jsonParsed" }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await res.json()) as {
      result?: { value?: Array<{ account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }> };
    };
    let total = 0n;
    for (const row of data.result?.value ?? []) {
      const amt = row.account?.data?.parsed?.info?.tokenAmount?.amount;
      if (amt) total += BigInt(amt);
    }
    return total;
  } catch {
    return 0n;
  }
}

type PayChain = "evm" | "sol";

async function resolvePaymentChain(
  session: WalletSession,
  networkMode: "mainnet" | "testnet",
  server: X402ServerPayConfig,
  provider?: EIP1193Provider,
): Promise<PayChain> {
  const canEvm = !!(server.acceptsEvm && server.evmPayToReady && session.evm?.address && provider);
  const solProv = solanaProvider(session);
  const canSol = !!(server.acceptsSol && server.solPayToReady && session.sol?.address && solProv);

  if (!canEvm && !canSol) {
    throw new Error(
      "Connect Solana and/or EVM (Ethereum on Base) in your wallet, and configure merchant receive addresses on the server.",
    );
  }
  if (canEvm && !canSol) return "evm";
  if (canSol && !canEvm) return "sol";

  const evmBal =
    canEvm && session.evm
      ? await evmUsdcBalance(session.evm.address as `0x${string}`, networkMode, provider!)
      : 0n;
  const solBal = canSol && session.sol ? await solUsdcBalance(session.sol.address, networkMode) : 0n;

  const evmOk = evmBal >= PRICE_ATOMIC;
  const solOk = solBal >= PRICE_ATOMIC;

  if (solOk && !evmOk) return "sol";
  if (evmOk && !solOk) return "evm";
  if (solOk && evmOk) return solBal >= evmBal ? "sol" : "evm";

  if (canSol) return "sol";
  return "evm";
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

export async function createX402PaidFetch(
  session: WalletSession,
  networkMode: "mainnet" | "testnet" = "mainnet",
  serverConfig: X402ServerPayConfig = {},
): Promise<typeof fetch> {
  const nets = USDC[networkMode];
  const provider = window.ethereum;
  const chain = networkMode === "testnet" ? baseSepolia : base;

  const preferred = await resolvePaymentChain(session, networkMode, serverConfig, provider);

  const client = new x402Client(paymentRequirementsSelector(preferred));

  if (preferred === "evm") {
    if (!session.evm?.address) {
      throw new Error("Connect EVM (Ethereum on Base) in Phantom or OKX to pay with USDC.");
    }
    if (!provider) {
      throw new Error("EVM wallet provider not found. Open Phantom or OKX and connect Ethereum.");
    }
    const userAddress = session.evm.address as `0x${string}`;
    const walletClient = createWalletClient({
      account: userAddress,
      chain,
      transport: custom(provider),
    }).extend(publicActions);
    const publicClient = createPublicClient({ chain, transport: custom(provider) });
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
    if (!session.sol?.address) {
      throw new Error("Connect Solana in Phantom or OKX to pay with USDC.");
    }
    const solProv = solanaProvider(session);
    if (!solProv?.signTransaction) {
      throw new Error("Solana wallet provider not found. Reconnect your wallet.");
    }
    const signer = createPhantomSolanaSigner(solProv, session.sol.address);
    registerExactSvmScheme(client, { signer, networks: [nets.solNetwork] });
  }

  return wrapFetchWithPayment(fetch, client);
}

if (typeof window !== "undefined") {
  window.createX402PaidFetch = createX402PaidFetch;
}
