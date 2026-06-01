/**
 * Mint a Metaplex NFT to the creator's Solana wallet when a signal is published.
 * Requires RWA_MINT_SOL_SECRET (minter authority with SOL for fees).
 */
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  none,
  percentAmount,
  publicKey,
  some,
  type TransactionSignature,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { getSolanaRpcUrlForServer } from "./x402-config";
import { normalizeSolPayTo } from "./x402-address";
import { rwaMetadataUri } from "./rwa-metadata-json";
import { siteOrigin } from "./rwa-token";
import type { CreatorSignal } from "./signals-types";
import type { SignalRwaToken } from "./rwa-types";
import { getSignalRwaToken, saveSignalRwaToken } from "./rwa-store";
import { isSolanaKeypairEnvSet, loadSolanaKeypairFromEnv } from "./solana-keypair";

const MINT_SECRET_ENV = "RWA_MINT_SOL_SECRET";

function txSignatureToString(signature: TransactionSignature): string {
  return base58.deserialize(signature)[0];
}

export type SolanaRwaMintStatus = "sent" | "skipped" | "failed";

export type SolanaRwaMintResult = {
  status: SolanaRwaMintStatus;
  mintAddress?: string;
  transaction?: string;
  reason?: string;
};

export function isSolanaRwaMintConfigured(): boolean {
  return isSolanaKeypairEnvSet(MINT_SECRET_ENV);
}

export async function mintSolanaSignalNft(
  signal: CreatorSignal,
  token: SignalRwaToken,
): Promise<SolanaRwaMintResult> {
  if (signal.creatorChain !== "sol") {
    return { status: "skipped", reason: "Creator not on Solana" };
  }

  const creator = normalizeSolPayTo(signal.creatorWallet);
  if (!creator) {
    return { status: "failed", reason: "Invalid Solana creator wallet" };
  }

  if (token.onChainMintAddress) {
    return {
      status: "sent",
      mintAddress: token.onChainMintAddress,
      transaction: token.onChainMintTx,
      reason: "Already minted",
    };
  }

  const keypair = loadSolanaKeypairFromEnv(MINT_SECRET_ENV);
  if (!keypair) {
    return { status: "skipped", reason: `${MINT_SECRET_ENV} not configured` };
  }

  const collectionMint = process.env.RWA_SIGNAL_CONTRACT_SOL?.trim();
  const uri = rwaMetadataUri(signal.id, siteOrigin());

  try {
    const umi = createUmi(getSolanaRpcUrlForServer()).use(mplTokenMetadata());
    const umiKeypair = fromWeb3JsKeypair(keypair);
    umi.use(keypairIdentity(umiKeypair));

    const mint = generateSigner(umi);
    const creatorPk = publicKey(creator);

    const builder = createNft(umi, {
      mint,
      name: token.metadata.name.slice(0, 32),
      symbol: "LOUNGE",
      uri,
      sellerFeeBasisPoints: percentAmount(0),
      tokenOwner: creatorPk,
      creators: [
        {
          address: creatorPk,
          verified: false,
          share: 100,
        },
      ],
      collection: collectionMint
        ? some({ key: publicKey(collectionMint), verified: false })
        : none(),
      collectionDetails: none(),
      isMutable: true,
    });

    const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    const txSig = txSignatureToString(signature);
    const mintAddress = mint.publicKey.toString();

    const updated: SignalRwaToken = {
      ...token,
      contractAddress: collectionMint || token.contractAddress,
      onChainMintAddress: mintAddress,
      onChainMintTx: txSig,
      onChainMintStatus: "sent",
    };
    await saveSignalRwaToken(updated);

    return { status: "sent", mintAddress, transaction: txSig };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[rwa-solana-mint]", msg);
    const failed: SignalRwaToken = {
      ...token,
      onChainMintStatus: "failed",
    };
    await saveSignalRwaToken(failed);
    return { status: "failed", reason: "Solana NFT mint failed" };
  }
}

/** Re-load token from store and mint if Solana creator. */
export async function mintSolanaSignalNftForSignal(
  signal: CreatorSignal,
): Promise<SolanaRwaMintResult> {
  const token = await getSignalRwaToken(signal.id);
  if (!token) {
    return { status: "skipped", reason: "RWA certificate missing" };
  }
  return mintSolanaSignalNft(signal, token);
}
