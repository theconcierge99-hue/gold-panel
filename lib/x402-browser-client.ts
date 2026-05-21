/**
 * Browser x402 client — bundled to public/js/x402-pay.mjs for Executive Lounge.
 * EVM USDC on Base (or Base Sepolia) via connected Phantom/OKX Ethereum provider.
 */
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { ClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  createPublicClient,
  createWalletClient,
  custom,
  publicActions,
  type EIP1193Provider,
} from "viem";
import { base, baseSepolia } from "viem/chains";

export type WalletSession = {
  evm?: { address: string; wallet: string } | null;
  sol?: { address: string; wallet: string } | null;
};

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
    createX402PaidFetch?: (
      session: WalletSession,
      networkMode?: "mainnet" | "testnet",
    ) => Promise<typeof fetch>;
  }
}

export async function createX402PaidFetch(
  session: WalletSession,
  networkMode: "mainnet" | "testnet" = "mainnet",
): Promise<typeof fetch> {
  if (!session?.evm?.address) {
    throw new Error(
      "Connect an EVM wallet (Phantom or OKX — Ethereum network) to pay 0.1 USDC via x402.",
    );
  }
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("EVM wallet provider not found. Open Phantom or OKX and connect Ethereum.");
  }

  const chain = networkMode === "testnet" ? baseSepolia : base;
  const network = networkMode === "testnet" ? ("eip155:84532" as const) : ("eip155:8453" as const);
  const address = session.evm.address as `0x${string}`;

  const publicClient = createPublicClient({ chain, transport: custom(provider) });
  const walletClient = createWalletClient({
    account: address,
    chain,
    transport: custom(provider),
  }).extend(publicActions);

  const signer: ClientEvmSigner = {
    address,
    signTypedData: (message) =>
      walletClient.signTypedData({
        account: address,
        domain: message.domain as Parameters<typeof walletClient.signTypedData>[0]["domain"],
        types: message.types as Parameters<typeof walletClient.signTypedData>[0]["types"],
        primaryType: message.primaryType,
        message: message.message as Parameters<typeof walletClient.signTypedData>[0]["message"],
      }),
    readContract: (args) => publicClient.readContract(args as Parameters<typeof publicClient.readContract>[0]),
  };
  const client = new x402Client();
  registerExactEvmScheme(client, { signer, networks: [network] });
  return wrapFetchWithPayment(fetch, client);
}

if (typeof window !== "undefined") {
  window.createX402PaidFetch = createX402PaidFetch;
}
