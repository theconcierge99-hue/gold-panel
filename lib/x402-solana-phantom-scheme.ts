/**
 * Browser Solana x402 exact — 3 instructions only (limit, price, transfer).
 * PayAI allows 3–6 instructions; Phantom Lighthouse adds extras at the end.
 * Omitting memo leaves room for up to 3 Lighthouse instructions (3+3=6).
 */
import type { PaymentRequirements } from "@x402/core/types";
import type { SchemeNetworkClient } from "@x402/core/types";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const COMPUTE_UNIT_LIMIT = 20_000;
const MAX_INSTRUCTIONS = 6;

type PhantomProvider = {
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
};

function countTxInstructions(wire: Uint8Array): number {
  try {
    const tx = getTransactionDecoder().decode(wire);
    const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const decompiled = decompileTransactionMessage(compiled);
    return decompiled.instructions?.length ?? 0;
  } catch {
    return 0;
  }
}

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
    const connection = new Connection(this.rpcUrl, {
      commitment: "confirmed",
      fetch: async (_url, init) =>
        fetch("/api/solana-rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: init?.body ?? undefined,
          signal: init?.signal ?? undefined,
        }),
    });

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

    const { blockhash } = await connection.getLatestBlockhash("confirmed");

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
    ];

    const vtx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: feePayer,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message(),
    );

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
    const ixCount = countTxInstructions(wire);
    if (ixCount > MAX_INSTRUCTIONS) {
      throw new Error(
        `invalid_exact_svm_payload_transaction_instructions_length: Phantom added ${ixCount} instructions (max ${MAX_INSTRUCTIONS}). Update Phantom or pay with Base (EVM).`,
      );
    }
    if (ixCount < 3) {
      throw new Error("Transaction missing required payment instructions");
    }

    let binary = "";
    for (let i = 0; i < wire.length; i++) binary += String.fromCharCode(wire[i]);
    return { x402Version, payload: { transaction: btoa(binary) } };
  }
}
