import { isAddress as isSolanaAddress } from "@solana/addresses";

/** Strip quotes, BOM, newlines — common when pasting into Vercel env UI */
export function cleanEnvAddress(raw: string | undefined | null): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  s = s.replace(/^\uFEFF/, "");
  s = s.replace(/^['"`]+|['"`]+$/g, "").trim();
  s = s.replace(/^=/, "").trim();
  s = s.replace(/[\r\n\u200B-\u200D]/g, "");
  return s.trim();
}

/**
 * Normalize merchant EVM receive address (Base USDC).
 * Edge-safe: regex only (no viem). Returns lowercase 0x + 40 hex.
 */
export function normalizeEvmPayTo(raw: string | undefined | null): string | null {
  let s = cleanEnvAddress(raw);
  if (!s) return null;

  if (s.startsWith("0x") && s.length !== 42) return null;
  if (!s.startsWith("0x") && /^[0-9a-fA-F]{40}$/.test(s)) {
    s = `0x${s}`;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(s) || s.length !== 42) {
    return null;
  }

  return s.toLowerCase();
}

/** Normalize Solana USDC receive address (base58, 32–44 chars). */
export function normalizeSolPayTo(raw: string | undefined | null): string | null {
  let s = cleanEnvAddress(raw);
  if (!s) return null;

  if (s.startsWith("0x")) return null;

  const solanaUri = s.match(/solana:([1-9A-HJ-NP-Za-km-z]{32,44})/i);
  if (solanaUri) s = solanaUri[1];

  if (s.includes("://") || /\s/.test(s)) return null;

  try {
    if (isSolanaAddress(s)) return s;
  } catch {
    return null;
  }

  return null;
}

/** Non-secret hints for Vercel setup debugging */
export function addressEnvDiagnostics(raw: string | undefined | null): {
  set: boolean;
  length: number;
  startsWith0x: boolean;
  looksBase58: boolean;
} {
  const s = cleanEnvAddress(raw);
  return {
    set: !!s,
    length: s.length,
    startsWith0x: s.startsWith("0x"),
    looksBase58: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s),
  };
}
