import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/** Load a Solana keypair from env (base58 secret or JSON byte array). */
export function loadSolanaKeypairFromEnv(envName: string): Keypair | null {
  const raw = process.env[envName]?.trim();
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

export function isSolanaKeypairEnvSet(envName: string): boolean {
  return !!process.env[envName]?.trim();
}
