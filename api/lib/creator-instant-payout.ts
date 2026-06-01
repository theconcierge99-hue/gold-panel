/**
 * Send the creator's 50% USDC share on-chain right after a signal unlock settles.
 * Reader payment (0.1 USDC) still goes to the merchant via x402; this transfers the
 * creator half from the platform payout wallet on the creator's chain.
 */
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import bs58 from "bs58";
import { getSolanaRpcUrlForServer, getUsdcAssetForNetwork, getX402NetworkProfile } from "./x402-config";
import { normalizeEvmPayTo, normalizeSolPayTo } from "./x402-address";

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export type CreatorPayoutStatus = "sent" | "skipped" | "failed";

export type CreatorPayoutResult = {
  status: CreatorPayoutStatus;
  tx?: string;
  reason?: string;
};

function loadSolanaPayoutKeypair(): Keypair | null {
  const raw = process.env.CREATOR_PAYOUT_SOL_SECRET?.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("[")) {
      const bytes = Uint8Array.from(JSON.parse(raw) as number[]);
      if (bytes.length !== 64) return null;
      return Keypair.fromSecretKey(bytes);
    }
    const decoded = bs58.decode(raw);
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
    if (decoded.length === 32) return Keypair.fromSeed(decoded);
    return null;
  } catch {
    return null;
  }
}

function loadEvmPayoutAccount() {
  const raw = process.env.CREATOR_PAYOUT_EVM_PRIVATE_KEY?.trim();
  if (!raw || !/^0x[a-fA-F0-9]{64}$/.test(raw)) return null;
  try {
    return privateKeyToAccount(raw as `0x${string}`);
  } catch {
    return null;
  }
}

function evmChainForProfile() {
  const mode = (process.env.X402_NETWORK_MODE || "mainnet").toLowerCase();
  return mode === "testnet" ? baseSepolia : base;
}

async function payoutSolanaUsdc(
  creatorWallet: string,
  shareAtomic: bigint,
): Promise<CreatorPayoutResult> {
  const payer = loadSolanaPayoutKeypair();
  if (!payer) {
    return { status: "skipped", reason: "CREATOR_PAYOUT_SOL_SECRET not configured" };
  }
  const creator = normalizeSolPayTo(creatorWallet);
  if (!creator) {
    return { status: "failed", reason: "Invalid Solana creator wallet" };
  }

  const nets = getX402NetworkProfile();
  const mint = new PublicKey(getUsdcAssetForNetwork(nets.sol));
  const connection = new Connection(getSolanaRpcUrlForServer(), "confirmed");
  const treasury = payer.publicKey;
  const recipient = new PublicKey(creator);

  const treasuryAta = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_PROGRAM_ID);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient, false, TOKEN_PROGRAM_ID);

  const ix = [
    createTransferCheckedInstruction(
      treasuryAta,
      mint,
      recipientAta,
      treasury,
      shareAtomic,
      6,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ];

  const recipientInfo = await connection.getAccountInfo(recipientAta);
  if (!recipientInfo) {
    ix.unshift(
      createAssociatedTokenAccountInstruction(
        treasury,
        recipientAta,
        recipient,
        mint,
        TOKEN_PROGRAM_ID,
      ),
    );
  }

  const tx = new Transaction().add(...ix);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
      skipPreflight: false,
    });
    return { status: "sent", tx: sig };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[creator-payout:sol]", msg);
    return { status: "failed", reason: "Solana payout failed" };
  }
}

async function payoutEvmUsdc(creatorWallet: string, shareAtomic: bigint): Promise<CreatorPayoutResult> {
  const account = loadEvmPayoutAccount();
  if (!account) {
    return { status: "skipped", reason: "CREATOR_PAYOUT_EVM_PRIVATE_KEY not configured" };
  }
  const to = normalizeEvmPayTo(creatorWallet);
  if (!to) {
    return { status: "failed", reason: "Invalid EVM creator wallet" };
  }

  const chain = evmChainForProfile();
  const nets = getX402NetworkProfile();
  const usdc = getUsdcAssetForNetwork(nets.evm) as `0x${string}`;
  const transport = http(process.env.BASE_RPC_URL || undefined);

  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  try {
    const hash = await walletClient.writeContract({
      address: usdc,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [to as `0x${string}`, shareAtomic],
    });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    return { status: "sent", tx: hash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[creator-payout:evm]", msg);
    return { status: "failed", reason: "EVM payout failed" };
  }
}

/** Transfer creator share (50% of unlock) to creator wallet on their registered chain. */
export async function disburseCreatorInstantShare(opts: {
  creatorWallet: string;
  creatorChain: "sol" | "evm";
  shareAtomic: string;
}): Promise<CreatorPayoutResult> {
  const share = BigInt(opts.shareAtomic);
  if (share <= 0n) {
    return { status: "skipped", reason: "Zero creator share" };
  }

  if (opts.creatorChain === "sol") {
    return payoutSolanaUsdc(opts.creatorWallet, share);
  }
  return payoutEvmUsdc(opts.creatorWallet, share);
}
