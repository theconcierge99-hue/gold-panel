/** Reader unlock fees — 100% protocol; creators earn Lounge points instead of USDC share. */

export const SIGNAL_CREATOR_SHARE_BPS = 0;

export const SIGNAL_MERCHANT_SHARE_BPS = 10000;

export const SIGNAL_CREATOR_SHARE_PERCENT = 0;
export const SIGNAL_MERCHANT_SHARE_PERCENT = 100;

/** Publish fee is minimum settlement (raw tier) — 100% merchant. */
export const SIGNAL_PUBLISH_FEE_TO_MERCHANT = true;

export function splitReaderUnlockAtomic(amountAtomic: string): {
  creatorAtomic: string;
  merchantAtomic: string;
} {
  const total = BigInt(amountAtomic);
  return {
    creatorAtomic: "0",
    merchantAtomic: total.toString(),
  };
}
