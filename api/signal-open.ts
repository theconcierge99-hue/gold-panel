import { handleSignalOpen } from "./lib/signal-open-handler";

/** Node — Solana SPL + viem USDC transfers for instant creator payout */
export const config = {
  runtime: "nodejs",
};

export default handleSignalOpen;
