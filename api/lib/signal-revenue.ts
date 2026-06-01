/** Reader unlock revenue split (on 0.1 USDC opens). */

/** Creator share of reader unlock fees (basis points: 5000 = 50%). */
export const SIGNAL_CREATOR_SHARE_BPS = 5000;

/** Merchant / platform share (basis points: 5000 = 50%). */
export const SIGNAL_MERCHANT_SHARE_BPS = 5000;

export const SIGNAL_CREATOR_SHARE_PERCENT = 50;
export const SIGNAL_MERCHANT_SHARE_PERCENT = 50;

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
