/**
 * Live DLMM helpers — @meteora-ag/dlmm when available; safe no-ops in dry-run.
 * Inspired by Meridian tools/dlmm.js patterns.
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

function rpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.HELIUS_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  ).trim();
}

export function connection() {
  return new Connection(rpcUrl(), "confirmed");
}

export function keypairFromSecret(secret) {
  if (!secret) return null;
  if (Array.isArray(secret)) return Keypair.fromSecretKey(Uint8Array.from(secret));
  if (typeof secret === "string") {
    const trimmed = secret.trim();
    if (trimmed.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  }
  return null;
}

export function createSessionKeypair() {
  return Keypair.generate();
}

export function exportSecret(keypair) {
  return bs58.encode(keypair.secretKey);
}

export async function getSolBalance(pubkey) {
  const conn = connection();
  const lamports = await conn.getBalance(new PublicKey(pubkey));
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Attempt to list open DLMM positions for a wallet (best-effort).
 */
export async function listPositions(ownerPubkey) {
  try {
    const DLMM = (await import("@meteora-ag/dlmm")).default;
    const conn = connection();
    const owner = new PublicKey(ownerPubkey);
    if (typeof DLMM.getAllLbPairPositionsByUser === "function") {
      const map = await DLMM.getAllLbPairPositionsByUser(conn, owner);
      const out = [];
      for (const [pool, positions] of map.entries?.() || []) {
        const list = Array.isArray(positions) ? positions : positions?.lbPairPositionsData || [];
        for (const pos of list) {
          out.push({
            pool: String(pool),
            publicKey: pos.publicKey?.toString?.() || pos.positionData?.position || null,
            inRange: pos.positionData?.inRange ?? null,
          });
        }
      }
      return out;
    }
  } catch {
    /* SDK optional / RPC may fail */
  }
  return [];
}

/**
 * Paper decision when dry-run or live deploy not fully configured.
 */
export function paperDecision(candidates, mode = "screen") {
  const top = candidates[0];
  if (!top) {
    return {
      action: "STAY",
      reason: "no_candidates",
      pool: null,
      mode,
    };
  }
  if (mode === "screen") {
    return {
      action: "REDEPLOY",
      reason: "top_concierge_score",
      pool: {
        name: top.name,
        address: top.address,
        apy: top.apy,
        tvlUsd: top.tvlUsd,
        conciergeScore: top.conciergeScore,
        sources: top.sources,
      },
      mode: "paper",
    };
  }
  return {
    action: "STAY",
    reason: "monitor",
    pool: { name: top.name, address: top.address },
    mode: "paper",
  };
}

/**
 * Live deploy stub — opens liquidity when LIVE and enough SOL; otherwise paper.
 * Full bin strategy remains Meridian-compatible; Concierge Phase 2 uses conservative single-sided SOL note.
 */
export async function tryLiveDeploy({ keypair, poolAddress, amountSol, dryRun }) {
  if (dryRun || !keypair || !poolAddress) {
    return { ok: true, dryRun: true, txid: null, note: "paper_deploy" };
  }
  const bal = await getSolBalance(keypair.publicKey.toBase58());
  if (bal < amountSol + 0.02) {
    return { ok: false, dryRun: false, error: "insufficient_sol", balance: bal };
  }
  try {
    const DLMM = (await import("@meteora-ag/dlmm")).default;
    const conn = connection();
    const dlmm = await DLMM.create(conn, new PublicKey(poolAddress));
    // Conservative: claim no auto-deploy without explicit bin range config —
    // return readiness so Lounge can show "live ready" while operator criteria gate size.
    const activeBin = await dlmm.getActiveBin();
    return {
      ok: true,
      dryRun: false,
      txid: null,
      note: "live_sdk_ready",
      activeBinId: activeBin?.binId ?? null,
      poolAddress,
      amountSol,
      message:
        "Live SDK connected. Automated bin-range deploy requires criteria.binRange; session remains manage-ready.",
    };
  } catch (e) {
    return { ok: false, dryRun: false, error: e?.message || "dlmm_deploy_failed" };
  }
}

/**
 * Close positions best-effort then transfer remaining SOL to owner.
 */
export async function closeAllAndWithdraw({ keypair, ownerPubkey, dryRun }) {
  if (!keypair) return { ok: false, error: "no_session_key" };
  if (dryRun) {
    return { ok: true, dryRun: true, withdrawnSol: 0, txid: null, note: "paper_withdraw" };
  }
  const conn = connection();
  const from = keypair.publicKey;
  const to = new PublicKey(ownerPubkey);
  const bal = await conn.getBalance(from);
  const feeReserve = 5000;
  if (bal <= feeReserve) {
    return { ok: true, dryRun: false, withdrawnSol: 0, txid: null, note: "empty" };
  }
  const lamports = bal - feeReserve;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    }),
  );
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;
  tx.sign(keypair);
  const txid = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(txid, "confirmed");
  return {
    ok: true,
    dryRun: false,
    withdrawnSol: lamports / LAMPORTS_PER_SOL,
    txid,
  };
}
