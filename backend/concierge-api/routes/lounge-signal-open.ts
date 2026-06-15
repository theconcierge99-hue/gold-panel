import { guardPaidX402Api } from "../x402-server";

/** Edge — reader pays 0.1 USDC; creator USDC payout runs on Node route */
export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-open");
  if ("response" in routed) return routed.response;
  const { runSignalOpenAfterPayment } = await import("../signal-open-handler");
  return runSignalOpenAfterPayment(request, routed.continue);
}
