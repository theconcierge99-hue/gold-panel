import { guardPaidX402Api } from "./lib/x402-server";

/** Edge — thin entry (402 without loading KV/RWA); Solana NFT on /api/rwa-mint-sol */
export const config = {
  runtime: "edge",
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-publish");
  if ("response" in routed) return routed.response;
  const { runSignalPublishAfterPayment } = await import("./lib/signal-publish-handler");
  return runSignalPublishAfterPayment(request, routed.continue);
}
