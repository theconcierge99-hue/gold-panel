/** Reader unlock revenue split (on 0.1 USDC opens — settled monthly off-chain). */

/** Creator share of reader unlock fees (basis points: 8000 = 80%). */
export const SIGNAL_CREATOR_SHARE_BPS = 8000;

/** Merchant / platform share (basis points: 2000 = 20%). */
export const SIGNAL_MERCHANT_SHARE_BPS = 2000;

export const SIGNAL_CREATOR_SHARE_PERCENT = 80;
export const SIGNAL_MERCHANT_SHARE_PERCENT = 20;

/** Publish fee (1 USDC) stays 100% merchant — not split. */
export const SIGNAL_PUBLISH_FEE_TO_MERCHANT = true;

export function splitReaderUnlockAtomic(amountAtomic: string): {
  creatorAtomic: string;
  merchantAtomic: string;
} {
  const total = BigInt(amountAtomic);
  const creator = (total * BigInt(SIGNAL_CREATOR_SHARE_BPS)) / 10000n;
  const merchant = total - creator;
  return {
    creatorAtomic: creator.toString(),
    merchantAtomic: merchant.toString(),
  };
}
