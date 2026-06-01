/**
 * Mint Executive Lounge signal NFT in the creator's Phantom wallet (creator pays SOL gas).
 * RPC: HTTP-only via /api/solana-rpc-send (no WebSocket — Vercel Edge cannot upgrade WS).
 */
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import type { Umi } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  none,
  percentAmount,
  publicKey,
  some,
} from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { Connection } from "@solana/web3.js";
import bs58 from "bs58";

export type MintLoungeSignalParams = {
  uri: string;
  name: string;
  creatorAddress: string;
  collectionMint?: string;
};

type PhantomLike = {
  publicKey: { toBase58(): string };
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions?: (txs: unknown[]) => Promise<unknown[]>;
};

export type MintLoungeSignalResult =
  | { ok: true; mintAddress: string; tx: string }
  | { ok: false; error: string };

function serverRpcProxy(): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
  if (!origin) throw new Error("Cannot resolve site origin for Solana RPC");
  return `${origin}/api/solana-rpc-send`;
}

/** Web3.js always opens a WS client for https endpoints; our proxy is POST-only. */
function createHttpProxyConnection(): Connection {
  const proxyUrl = serverRpcProxy();
  const connection = new Connection(proxyUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 90_000,
  });
  const internal = connection as Connection & {
    _rpcWebSocket?: { close?: () => void } | null;
  };
  try {
    internal._rpcWebSocket?.close?.();
  } catch {
    /* ignore */
  }
  internal._rpcWebSocket = null;
  return connection;
}

function createMintUmi(phantom: PhantomLike): Umi {
  return createUmi(createHttpProxyConnection())
    .use(mplTokenMetadata())
    .use(walletAdapterIdentity(phantom));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Confirm without WebSocket signatureSubscribe (HTTP poll only). */
async function confirmViaHttpPoll(
  umi: Umi,
  signature: Uint8Array,
  lastValidBlockHeight: number,
): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const statuses = await umi.rpc.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const st = statuses[0];
    if (st?.error) {
      throw new Error(
        typeof st.error === "string" ? st.error : JSON.stringify(st.error),
      );
    }
    if (
      st?.confirmationStatus === "confirmed" ||
      st?.confirmationStatus === "finalized"
    ) {
      return;
    }
    const blockHeight = (await umi.rpc.call("getBlockHeight", [
      { commitment: "confirmed" },
    ])) as number;
    if (blockHeight > lastValidBlockHeight) {
      throw new Error(
        `Signature ${bs58.encode(signature)} has expired: block height exceeded.`,
      );
    }
    await sleep(1500);
  }
  throw new Error(
    "NFT mint confirmation timed out — approve the Phantom prompt within ~60s and try again.",
  );
}

function friendlyMintError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("block height exceeded") || m.includes("has expired")) {
    return "Mint took too long before Phantom approval. Click Mint & Publish again and approve the NFT prompt right away.";
  }
  if (m.includes("freetier") || m.includes("upgrade to paid") || m.includes("code\":35")) {
    return "Solana RPC misconfigured (dRPC free tier). In Vercel set SOLANA_RPC_URL to Helius or publicnode — see docs/configuration.md.";
  }
  if (m.includes("insufficient") || m.includes("lamports") || m.includes("0x1")) {
    return "Not enough SOL for NFT mint — add at least 0.03 SOL in Phantom, then publish again.";
  }
  if (m.includes("collection") || m.includes("account not found")) {
    return "NFT mint failed (invalid collection). Retried without collection.";
  }
  if (m.includes("timed out")) {
    return msg;
  }
  if (m.includes("blockhash") || m.includes("rpc") || m.includes("websocket")) {
    return `Solana RPC error: ${msg.slice(0, 120)}. Ensure production is on the latest deploy.`;
  }
  return msg.slice(0, 240) || "Mint failed";
}

async function mintOnce(
  params: MintLoungeSignalParams,
  phantom: PhantomLike,
  useCollection: boolean,
): Promise<{ mintAddress: string; tx: string }> {
  const umi = createMintUmi(phantom);
  const mint = generateSigner(umi);
  const creatorPk = publicKey(params.creatorAddress.trim());
  const collectionMint = useCollection ? params.collectionMint?.trim() : undefined;

  let builder = createNft(umi, {
    mint,
    name: params.name.slice(0, 32),
    symbol: "LOUNGE",
    uri: params.uri,
    sellerFeeBasisPoints: percentAmount(0),
    tokenOwner: creatorPk,
    creators: [{ address: creatorPk, verified: false, share: 100 }],
    collection: collectionMint
      ? some({ key: publicKey(collectionMint), verified: false })
      : none(),
    collectionDetails: none(),
    isMutable: true,
  });

  builder = await builder.setLatestBlockhash(umi);
  const blockhash =
    typeof builder.options.blockhash === "object"
      ? builder.options.blockhash
      : await umi.rpc.getLatestBlockhash();

  const signature = await builder.send(umi);
  await confirmViaHttpPoll(umi, signature, blockhash.lastValidBlockHeight);

  return {
    mintAddress: mint.publicKey.toString(),
    tx: bs58.encode(signature),
  };
}

export async function mintLoungeSignalNft(
  params: MintLoungeSignalParams,
  phantom: PhantomLike,
): Promise<MintLoungeSignalResult> {
  if (!phantom?.publicKey) {
    return { ok: false, error: "Solana wallet not connected" };
  }
  const creator = params.creatorAddress.trim();
  if (phantom.publicKey.toBase58() !== creator) {
    return { ok: false, error: "Connected wallet must match creator address" };
  }

  const hasCollection = !!params.collectionMint?.trim();
  let lastErr = "Mint failed";

  for (const useCollection of hasCollection ? [true, false] : [false]) {
    for (let retry = 0; retry < 2; retry++) {
      try {
        const { mintAddress, tx } = await mintOnce(params, phantom, useCollection);
        return { ok: true, mintAddress, tx };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        const expired =
          lastErr.toLowerCase().includes("block height exceeded") ||
          lastErr.toLowerCase().includes("has expired");
        if (!expired) break;
      }
    }
  }

  return { ok: false, error: friendlyMintError(lastErr) };
}

declare global {
  interface Window {
    mintLoungeSignalNft?: typeof mintLoungeSignalNft;
  }
}

if (typeof window !== "undefined") {
  window.mintLoungeSignalNft = mintLoungeSignalNft;
}
