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

function formatUsdcAtomic(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const frac = atomic % 1_000_000n;
  if (frac === 0n) return `${whole} USDC`;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} USDC`;
}

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

    if (merchant.equals(feePayer)) {
      throw new Error(
        "X402_SOL_PAY_TO must not be the PayAI fee payer address — use your merchant receive wallet in Vercel",
      );
    }

    const [userAtaInfo, merchantAtaInfo] = await Promise.all([
      connection.getAccountInfo(userAta),
      connection.getAccountInfo(merchantAta),
    ]);
    if (!merchantAtaInfo) {
      throw new Error(
        "Merchant USDC account not initialized on Solana — send a tiny USDC once to the merchant address (X402_SOL_PAY_TO), then retry",
      );
    }
    if (!userAtaInfo) {
      throw new Error(
        "No USDC token account on Solana — receive USDC once in Phantom to open your USDC account, then retry",
      );
    }
    if (amount > 0n) {
      try {
        const bal = await connection.getTokenAccountBalance(userAta);
        const userBal = BigInt(bal.value.amount);
        if (userBal < amount) {
          throw new Error(
            `Insufficient USDC on Solana (have ${formatUsdcAtomic(userBal)}, need ${formatUsdcAtomic(amount)})`,
          );
        }
      } catch (e) {
        if (e instanceof Error && /Insufficient USDC/i.test(e.message)) throw e;
        /* balance read failed — still attempt sign; facilitator will reject if underfunded */
      }
    }

    let blockhash: string;
    try {
      const latest = await connection.getLatestBlockhash("confirmed");
      blockhash = latest.blockhash;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`Solana RPC blockhash failed (${detail}). Hard refresh and retry.`);
    }

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
      throw new Error(msg || "Phantom signTransaction failed");
    }

    const wire = signed.serialize();
    const ixCount = countTxInstructions(wire);
    if (ixCount > MAX_INSTRUCTIONS) {
      throw new Error(
        `invalid_exact_svm_payload_transaction_instructions_length: Phantom added ${ixCount} instructions (max ${MAX_INSTRUCTIONS}). Update Phantom or retry.`,
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
