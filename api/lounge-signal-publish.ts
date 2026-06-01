import { guardPaidX402Api } from "./lib/x402-server";

/** Edge — creator pays 1 USDC to publish; NFT mint is a separate Node route */
export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-publish");
  if ("response" in routed) return routed.response;
  const { runSignalPublishAfterPayment } = await import("./lib/signal-publish-handler");
  return runSignalPublishAfterPayment(request, routed.continue);
}
