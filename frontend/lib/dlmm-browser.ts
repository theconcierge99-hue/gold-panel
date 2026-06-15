/**
 * Manual Meteora DLMM — browser wallet signs every tx (Phantom / Privy Solana).
 * RPC via /api/solana-rpc-send (same as NFT mint).
 */
import DLMM, {
  StrategyType,
  autoFillYByStrategy,
  autoFillXByStrategy,
} from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export type DlmmRangePreset = "narrow" | "medium" | "wide";

export type DlmmPoolRef = {
  address: string;
  symbol: string;
  tokenX?: string;
  tokenY?: string;
  decimalsX?: number;
  decimalsY?: number;
};

export type DlmmWalletAdapter = {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

export type DlmmActionResult =
  | { ok: true; signature: string; detail?: string }
  | { ok: false; error: string };

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function serverRpcProxy(): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
  if (!origin) throw new Error("Cannot resolve site origin for Solana RPC");
  return `${origin}/api/solana-rpc-send`;
}

function makeConnection(): Connection {
  const endpoint = serverRpcProxy();
  return new Connection(endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    fetch: async (url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: body.method,
          params: body.params ?? [],
          id: body.id ?? 1,
        }),
      });
      const json = await res.json();
      return new Response(JSON.stringify(json), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}

function rangeBins(preset: DlmmRangePreset): number {
  if (preset === "narrow") return 5;
  if (preset === "wide") return 25;
  return 12;
}

function friendlyDlmmError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("insufficient") || m.includes("lamports") || m.includes("0x1")) {
    return "Not enough SOL for fees — keep ~0.05 SOL in your wallet.";
  }
  if (m.includes("user rejected") || m.includes("cancelled")) {
    return "Transaction cancelled in wallet.";
  }
  if (m.includes("blockhash") || m.includes("expired")) {
    return "Transaction expired — try again and approve quickly in your wallet.";
  }
  if (m.includes("slippage") || m.includes("liquidity")) {
    return `DLMM error: ${msg.slice(0, 180)}`;
  }
  return msg.slice(0, 240) || "DLMM transaction failed";
}

async function sendTxBundle(
  connection: Connection,
  wallet: DlmmWalletAdapter,
  txs: Transaction | Transaction[],
  extraSigners: Keypair[] = [],
): Promise<string> {
  const list = Array.isArray(txs) ? txs : [txs];
  for (const tx of list) {
    for (const kp of extraSigners) tx.partialSign(kp);
  }

  const signed =
    wallet.signAllTransactions && list.length > 1
      ? await wallet.signAllTransactions(list)
      : await Promise.all(list.map((tx) => wallet.signTransaction(tx)));

  let lastSig = "";
  for (const tx of signed) {
    lastSig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature: lastSig, blockhash, lastValidBlockHeight }, "confirmed");
  }
  return lastSig;
}

function isUsdcMint(mint: string): boolean {
  return mint === USDC_MINT;
}

function toAtomic(amountUi: number, decimals: number): BN {
  const factor = 10 ** decimals;
  const raw = Math.floor(amountUi * factor);
  if (!Number.isFinite(raw) || raw <= 0) throw new Error("Enter a valid amount");
  return new BN(raw);
}

export async function dlmmAddLiquidityManual(
  pool: DlmmPoolRef,
  wallet: DlmmWalletAdapter,
  options: { amountUsdc: number; range: DlmmRangePreset },
): Promise<DlmmActionResult> {
  try {
    if (!wallet?.publicKey) return { ok: false, error: "Solana wallet not connected" };
    const poolPk = new PublicKey(pool.address);
    const connection = makeConnection();
    const dlmmPool = await DLMM.create(connection, poolPk);
    const activeBin = await dlmmPool.getActiveBin();
    const span = rangeBins(options.range);
    const minBinId = activeBin.binId - span;
    const maxBinId = activeBin.binId + span;

    const tokenXMint = dlmmPool.tokenX.publicKey.toBase58();
    const tokenYMint = dlmmPool.tokenY.publicKey.toBase58();
    const decX = dlmmPool.tokenX.mint.decimals;
    const decY = dlmmPool.tokenY.mint.decimals;

    let totalXAmount = new BN(0);
    let totalYAmount = new BN(0);

    if (isUsdcMint(tokenYMint)) {
      totalYAmount = toAtomic(options.amountUsdc, decY);
      totalXAmount = autoFillXByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        totalYAmount,
        activeBin.yAmount,
        activeBin.xAmount,
        minBinId,
        maxBinId,
        StrategyType.Spot,
      );
    } else if (isUsdcMint(tokenXMint)) {
      totalXAmount = toAtomic(options.amountUsdc, decX);
      totalYAmount = autoFillYByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        totalXAmount,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        StrategyType.Spot,
      );
    } else {
      return {
        ok: false,
        error: "This pool is not USDC-paired — pick a SOL-USDC or token-USDC pool from the list.",
      };
    }

    const positionKp = Keypair.generate();
    const txOrTxs = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKp.publicKey,
      user: wallet.publicKey,
      totalXAmount,
      totalYAmount,
      strategy: {
        minBinId,
        maxBinId,
        strategyType: StrategyType.Spot,
      },
    });

    const sig = await sendTxBundle(connection, wallet, txOrTxs, [positionKp]);
    return {
      ok: true,
      signature: sig,
      detail: `Position ${positionKp.publicKey.toBase58().slice(0, 8)}… · bins ${minBinId}–${maxBinId}`,
    };
  } catch (e) {
    return { ok: false, error: friendlyDlmmError(e instanceof Error ? e.message : String(e)) };
  }
}

export async function dlmmRemoveLiquidityManual(
  pool: DlmmPoolRef,
  wallet: DlmmWalletAdapter,
): Promise<DlmmActionResult> {
  try {
    if (!wallet?.publicKey) return { ok: false, error: "Solana wallet not connected" };
    const connection = makeConnection();
    const dlmmPool = await DLMM.create(connection, new PublicKey(pool.address));
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
    if (!userPositions?.length) {
      return { ok: false, error: "No DLMM position found in this pool for your wallet" };
    }

    const position = userPositions[0];
    const binIds = position.positionData.positionBinData.map((b) => b.binId);
    const minBinId = Math.min(...binIds);
    const maxBinId = Math.max(...binIds);
    const bps = new BN(10_000);

    const txOrTxs = await dlmmPool.removeLiquidity({
      position: position.publicKey,
      user: wallet.publicKey,
      fromBinId: minBinId,
      toBinId: maxBinId,
      bps,
      shouldClaimAndClose: true,
    });

    const sig = await sendTxBundle(connection, wallet, txOrTxs);
    return { ok: true, signature: sig, detail: "Liquidity removed from position" };
  } catch (e) {
    return { ok: false, error: friendlyDlmmError(e instanceof Error ? e.message : String(e)) };
  }
}

/** Rebalance = remove 100% then re-add with fresh range around active bin. */
export async function dlmmRebalanceManual(
  pool: DlmmPoolRef,
  wallet: DlmmWalletAdapter,
  options: { amountUsdc: number; range: DlmmRangePreset },
): Promise<DlmmActionResult> {
  const removed = await dlmmRemoveLiquidityManual(pool, wallet);
  if (!removed.ok) {
    if (removed.error.includes("No DLMM position")) {
      return dlmmAddLiquidityManual(pool, wallet, options);
    }
    return removed;
  }
  return dlmmAddLiquidityManual(pool, wallet, options);
}

export function phantomToDlmmWallet(phantom: {
  publicKey: { toBase58(): string };
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
}): DlmmWalletAdapter {
  return {
    publicKey: new PublicKey(phantom.publicKey.toBase58()),
    signTransaction: (tx) => phantom.signTransaction(tx as Transaction),
    signAllTransactions: phantom.signAllTransactions
      ? (txs) => phantom.signAllTransactions!(txs as Transaction[])
      : undefined,
  };
}

export function privySignerToDlmmWallet(
  address: string,
  signer: { signTransaction: (tx: unknown) => Promise<unknown> },
): DlmmWalletAdapter {
  return {
    publicKey: new PublicKey(address),
    signTransaction: async (tx) => {
      const signed = await signer.signTransaction(tx);
      return signed as Transaction;
    },
  };
}

declare global {
  interface Window {
    dlmmAddLiquidityManual?: typeof dlmmAddLiquidityManual;
    dlmmRemoveLiquidityManual?: typeof dlmmRemoveLiquidityManual;
    dlmmRebalanceManual?: typeof dlmmRebalanceManual;
    phantomToDlmmWallet?: typeof phantomToDlmmWallet;
    privySignerToDlmmWallet?: typeof privySignerToDlmmWallet;
  }
}

if (typeof window !== "undefined") {
  window.dlmmAddLiquidityManual = dlmmAddLiquidityManual;
  window.dlmmRemoveLiquidityManual = dlmmRemoveLiquidityManual;
  window.dlmmRebalanceManual = dlmmRebalanceManual;
  window.phantomToDlmmWallet = phantomToDlmmWallet;
  window.privySignerToDlmmWallet = privySignerToDlmmWallet;
}
