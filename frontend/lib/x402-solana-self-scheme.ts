/**
 * Solana x402 exact — self-settle (SOON etc.). User is fee payer; server broadcasts signed tx.
 */
import type { PaymentRequirements } from "@x402/core/types";
import type { SchemeNetworkClient } from "@x402/core/types";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { associatedTokenAddress, resolveTokenProgramId } from "./solana-token-program";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const COMPUTE_UNIT_LIMIT = 25_000;

type PhantomProvider = {
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
};

function tokenLabel(extra: PaymentRequirements["extra"]): string {
  const name = extra?.name;
  return typeof name === "string" && name ? name : "token";
}

function tokenDecimals(extra: PaymentRequirements["extra"]): number {
  const d = extra?.decimals;
  return typeof d === "number" && d >= 0 && d <= 12 ? d : 6;
}

function formatAtomic(atomic: bigint, decimals: number, symbol: string): string {
  const factor = 10n ** BigInt(decimals);
  const whole = atomic / factor;
  return `${whole.toLocaleString("en-US")} ${symbol}`;
}

export class SolanaSelfSettleScheme implements SchemeNetworkClient {
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
    if (paymentRequirements.extra?.settlement !== "self") {
      throw new Error("Self-settle scheme requires settlement=self in payment requirements");
    }

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

    const symbol = tokenLabel(paymentRequirements.extra);
    const decimals = tokenDecimals(paymentRequirements.extra);
    const user = new PublicKey(this.userAddress);
    const merchant = new PublicKey(paymentRequirements.payTo);
    const mint = new PublicKey(paymentRequirements.asset);
    const amount = BigInt(paymentRequirements.amount);

    if (user.equals(merchant)) {
      throw new Error("Merchant address matches your wallet — fix X402_SOL_PAY_TO on server");
    }

    const tokenProgramId = await resolveTokenProgramId(connection, mint);
    const userAta = associatedTokenAddress(mint, user, tokenProgramId);
    const merchantAta = associatedTokenAddress(mint, merchant, tokenProgramId);

    const [userAtaInfo, merchantAtaInfo] = await Promise.all([
      connection.getAccountInfo(userAta),
      connection.getAccountInfo(merchantAta),
    ]);
    if (!merchantAtaInfo) {
      throw new Error(
        `Merchant ${symbol} account not initialized — send a tiny ${symbol} to the merchant wallet once, then retry`,
      );
    }
    if (!userAtaInfo) {
      throw new Error(`No ${symbol} token account — receive ${symbol} in your wallet first, then retry`);
    }

    const bal = await connection.getTokenAccountBalance(userAta);
    const userBal = BigInt(bal.value.amount);
    if (userBal < amount) {
      throw new Error(
        `Insufficient ${symbol} (have ${formatAtomic(userBal, decimals, symbol)}, need ${formatAtomic(amount, decimals, symbol)})`,
      );
    }

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
        decimals,
        [],
        tokenProgramId,
      ),
    ];

    const vtx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message(),
    );

    let signed: VersionedTransaction;
    try {
      signed = await this.provider.signTransaction(vtx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if ((e as { code?: number })?.code === 4001 || /reject|cancel|denied/i.test(msg)) {
        throw new Error("Payment cancelled");
      }
      throw new Error(msg || "Wallet signTransaction failed");
    }

    const wire = signed.serialize();
    let binary = "";
    for (let i = 0; i < wire.length; i++) binary += String.fromCharCode(wire[i]);
    return { x402Version, payload: { transaction: btoa(binary) } };
  }
}
