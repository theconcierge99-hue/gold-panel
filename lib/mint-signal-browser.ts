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

const SOL_RPC =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/solana-rpc-send`
    : "https://solana-rpc.publicnode.com";

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

  try {
    const umi = createUmi(SOL_RPC).use(mplTokenMetadata()).use(walletAdapterIdentity(phantom));
    const mint = generateSigner(umi);
    const creatorPk = publicKey(creator);
    const collectionMint = params.collectionMint?.trim();

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
      ok: true,
      mintAddress: mint.publicKey.toString(),
      tx: bs58.encode(signature),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 240) || "Mint failed" };
  }
}

declare global {
  interface Window {
    mintLoungeSignalNft?: typeof mintLoungeSignalNft;
  }
}

if (typeof window !== "undefined") {
  window.mintLoungeSignalNft = mintLoungeSignalNft;
}
