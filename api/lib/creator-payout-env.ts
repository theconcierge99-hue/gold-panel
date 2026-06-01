/** Edge-safe: payout wallet presence only (no @solana / viem imports). */

export function creatorPayoutWalletsConfigured(): { sol: boolean; evm: boolean } {
  const solSecret = process.env.CREATOR_PAYOUT_SOL_SECRET?.trim();
  const evmKey = process.env.CREATOR_PAYOUT_EVM_PRIVATE_KEY?.trim();
  return {
    sol: !!solSecret,
    evm: !!evmKey && /^0x[a-fA-F0-9]{64}$/.test(evmKey),
  };
}
