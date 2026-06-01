import { handleSignalOpen } from "./lib/signal-open-handler";

/** Edge — x402 + KV; creator payout loads @solana/web3.js only after payment settles */
export const config = {
  runtime: "edge",
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  return handleSignalOpen(request);
}
