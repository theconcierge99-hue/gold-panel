import { guardPaidX402Api } from "../x402-server";

/** Edge — creator pays 1 USDC to publish; NFT mint is a separate Node route */
export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-publish");
  if ("response" in routed) return routed.response;
  const { runSignalPublishAfterPayment } = await import("../signal-publish-handler");
  return runSignalPublishAfterPayment(request, routed.continue);
}
