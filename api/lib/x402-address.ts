import { getAddress, isAddress } from "viem";

/**
 * Normalize merchant EVM receive address (Base USDC).
 * Rejects Solana keys, hashes, and malformed 0x values.
 */
export function normalizeEvmPayTo(raw: string | undefined | null): string | null {
  const s = (raw || "").trim();
  if (!s) return null;

  if (!isAddress(s, { strict: false })) {
    console.error(
      "[x402] Invalid X402_EVM_PAY_TO — must be your Base Ethereum wallet (0x + 40 hex). " +
        `Received ${s.length} characters. Do not use a Solana address here.`,
    );
    return null;
  }

  try {
    return getAddress(s);
  } catch {
    console.error("[x402] Invalid X402_EVM_PAY_TO checksum");
    return null;
  }
}

/** Solana USDC receive address (base58, typically 32–44 chars). */
export function normalizeSolPayTo(raw: string | undefined | null): string | null {
  const s = (raw || "").trim();
  if (!s) return null;

  if (s.startsWith("0x")) {
    console.error(
      "[x402] Invalid X402_SOL_PAY_TO — looks like an EVM address. Use a Solana wallet address (base58, no 0x prefix).",
    );
    return null;
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) {
    console.error("[x402] Invalid X402_SOL_PAY_TO — expected a Solana base58 address.");
    return null;
  }

  return s;
}
