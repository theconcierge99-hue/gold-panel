/**
 * Browser Solana x402 exact payments — matches @x402/svm layout:
 * compute limit, compute price, transferChecked, memo (PayAI verify requires this order).
 */
import type { PaymentRequirements } from "@x402/core/types";
import type { SchemeNetworkClient } from "@x402/core/types";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

/** Solana memo program (x402 exact optional 4th instruction) */
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
/** @x402/svm DEFAULT_COMPUTE_UNIT_LIMIT */
const COMPUTE_UNIT_LIMIT = 20_000;

type PhantomProvider = {
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
};

export class SolanaExactPhantomScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  constructor(
    private readonly provider: PhantomProvider,
    private readonly userAddress: string,
    private readonly rpcUrl: string,
  ) {}

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<{ x402Version: number; payload: { transaction: string } }> {
    const connection = new Connection(this.rpcUrl, "confirmed");
    const user = new PublicKey(this.userAddress);
    const merchant = new PublicKey(paymentRequirements.payTo);
    const mint = new PublicKey(paymentRequirements.asset);
    const feePayerRaw = paymentRequirements.extra?.feePayer;
    if (!feePayerRaw || typeof feePayerRaw !== "string") {
      throw new Error("feePayer is required in paymentRequirements.extra for Solana");
    }
    const feePayer = new PublicKey(feePayerRaw);
    const amount = BigInt(paymentRequirements.amount);

    if (user.equals(merchant)) {
      throw new Error(
        "Merchant Solana address matches your wallet — set X402_SOL_PAY_TO to a different receive address in Vercel",
      );
    }

    const userAta = getAssociatedTokenAddressSync(mint, user, false, TOKEN_PROGRAM_ID);
    const merchantAta = getAssociatedTokenAddressSync(mint, merchant, false, TOKEN_PROGRAM_ID);

    const merchantAtaInfo = await connection.getAccountInfo(merchantAta);
    if (!merchantAtaInfo) {
      throw new Error(
        "Merchant USDC account not initialized — send any USDC once to the merchant Solana address in Vercel (X402_SOL_PAY_TO), then retry",
      );
    }

    const userAtaInfo = await connection.getAccountInfo(userAta);
    if (!userAtaInfo) {
      throw new Error("Your USDC token account was not found — receive USDC in Phantom on Solana first");
    }

    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const memoText = Array.from(nonce)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      createTransferCheckedInstruction(
        userAta,
        mint,
        merchantAta,
        user,
        amount,
        6,
        [],
        TOKEN_PROGRAM_ID,
      ),
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(new TextEncoder().encode(memoText)),
      }),
    ];

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const vtx = new VersionedTransaction(message);
    let signed: VersionedTransaction;
    try {
      signed = await this.provider.signTransaction(vtx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: number })?.code;
      if (code === 4001 || /reject|cancel|denied/i.test(msg)) {
        throw new Error("Payment cancelled");
      }
      throw e;
    }

    const wire = signed.serialize();
    let binary = "";
    for (let i = 0; i < wire.length; i++) binary += String.fromCharCode(wire[i]);
    const base64 = btoa(binary);
    return { x402Version, payload: { transaction: base64 } };
  }
}
