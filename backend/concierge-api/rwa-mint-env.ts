/** Edge-safe: RWA mint wallet presence only (no @solana imports). */

export function solanaRwaMintConfigured(): boolean {
  return !!process.env.RWA_MINT_SOL_SECRET?.trim();
}
