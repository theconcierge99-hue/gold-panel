/**
 * Concierge LP — wallet message signature auth for Start/Stop.
 *
 * Messages:
 *   concierge-lp:v1:start:{wallet}:{nonce}:{exp}
 *   concierge-lp:v1:stop:{wallet}:{sessionId}:{nonce}:{exp}
 */
import { PublicKey } from "@solana/web3.js";

const MSG_MAX_AGE_MS = 10 * 60 * 1000;

export type LpAuthAction = "start" | "stop";

export function buildLpStartMessage(wallet: string, nonce: string, exp: number): string {
  return `concierge-lp:v1:start:${wallet}:${nonce}:${exp}`;
}

export function buildLpStopMessage(
  wallet: string,
  sessionId: string,
  nonce: string,
  exp: number,
): string {
  return `concierge-lp:v1:stop:${wallet}:${sessionId}:${nonce}:${exp}`;
}

function decodeSig(signature: string): Uint8Array | null {
  const s = signature.trim();
  if (!s) return null;
  try {
    if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
      const out = new Uint8Array(s.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
  } catch {
    /* fall through */
  }
  try {
    // base64
    if (s.includes("+") || s.includes("/") || s.endsWith("=") || /^[A-Za-z0-9+/]+=*$/.test(s)) {
      const bin = atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
  } catch {
    /* fall through */
  }
  try {
    // dynamic import bs58 — available in repo deps
    // eslint-disable-next-line @typescript-eslint/no-require-imports
  } catch {
    /* */
  }
  return null;
}

async function decodeSigAsync(signature: string): Promise<Uint8Array | null> {
  const direct = decodeSig(signature);
  if (direct && direct.length === 64) return direct;
  try {
    const bs58 = (await import("bs58")).default;
    const decoded = bs58.decode(signature.trim());
    if (decoded.length === 64) return decoded;
  } catch {
    /* */
  }
  if (direct) return direct;
  return null;
}

export async function verifyLpWalletSignature(opts: {
  wallet: string;
  message: string;
  signature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { wallet, message, signature } = opts;
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(wallet);
  } catch {
    return { ok: false, error: "invalid_wallet" };
  }

  const parts = message.split(":");
  if (parts[0] !== "concierge-lp" || parts[1] !== "v1") {
    return { ok: false, error: "invalid_message_prefix" };
  }
  const action = parts[2];
  if (action !== "start" && action !== "stop") {
    return { ok: false, error: "invalid_action" };
  }

  const expStr = parts[parts.length - 1];
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now() - 30_000) {
    return { ok: false, error: "message_expired" };
  }
  if (exp * 1000 > Date.now() + MSG_MAX_AGE_MS) {
    return { ok: false, error: "message_exp_too_far" };
  }

  const msgWallet = action === "start" ? parts[3] : parts[3];
  if (msgWallet !== wallet) {
    return { ok: false, error: "wallet_mismatch" };
  }

  const sigBytes = await decodeSigAsync(signature);
  if (!sigBytes || sigBytes.length !== 64) {
    return { ok: false, error: "invalid_signature_encoding" };
  }

  try {
    const { ed25519 } = await import("@noble/curves/ed25519");
    const msgBytes = new TextEncoder().encode(message);
    const ok = ed25519.verify(sigBytes, msgBytes, pubkey.toBytes());
    if (!ok) return { ok: false, error: "signature_invalid" };
    return { ok: true };
  } catch {
    return { ok: false, error: "verify_unavailable" };
  }
}

export function parseStopSessionId(message: string): string | null {
  const parts = message.split(":");
  // concierge-lp:v1:stop:wallet:sessionId:nonce:exp
  if (parts.length < 7 || parts[2] !== "stop") return null;
  return parts[4] || null;
}
