/** Edge-safe payout result types (no @solana / viem imports). */

export type CreatorPayoutStatus = "sent" | "skipped" | "failed";

export type CreatorPayoutResult = {
  status: CreatorPayoutStatus;
  tx?: string;
  reason?: string;
};
