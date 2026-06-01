/**
 * Mint Executive Lounge signal NFT in the creator's Phantom wallet (creator pays SOL gas).
 */
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  none,
  percentAmount,
  publicKey,
  some,
} from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
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

function rpcEndpoints(): string[] {
  const origin =
    typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
  const list: string[] = [];
  if (origin) list.push(`${origin}/api/solana-rpc-send`);
  list.push(
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
    "https://solana.drpc.org",
  );
  return list;
}

function friendlyMintError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("insufficient") || m.includes("lamports") || m.includes("0x1")) {
    return "Not enough SOL for NFT mint fees — add at least 0.03 SOL in Phantom, then publish again.";
  }
  if (m.includes("collection") || m.includes("account not found")) {
    return "NFT mint failed (collection or account). Retrying without collection…";
  }
  if (m.includes("rpc failed") || m.includes("fetch")) {
    return "Solana RPC error — check connection and try again in a minute.";
  }
  return msg.slice(0, 240) || "Mint failed";
}

async function mintOnce(
  rpcUrl: string,
  params: MintLoungeSignalParams,
  phantom: PhantomLike,
  useCollection: boolean,
): Promise<{ mintAddress: string; tx: string }> {
  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(walletAdapterIdentity(phantom));
  const mint = generateSigner(umi);
  const creatorPk = publicKey(params.creatorAddress.trim());
  const collectionMint = useCollection ? params.collectionMint?.trim() : undefined;

  const builder = createNft(umi, {
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

  const { signature } = await builder.sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });

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

  const endpoints = rpcEndpoints();
  const hasCollection = !!params.collectionMint?.trim();
  let lastErr = "Mint failed";

  for (const rpcUrl of endpoints) {
    for (const useCollection of hasCollection ? [true, false] : [false]) {
      try {
        const { mintAddress, tx } = await mintOnce(rpcUrl, params, phantom, useCollection);
        return { ok: true, mintAddress, tx };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        if (!hasCollection) break;
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
