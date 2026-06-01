import { guardPaidX402Api } from "./lib/x402-server";

/** Edge — thin entry (402 first); creator payout loads only after payment */
export const config = {
  runtime: "edge",
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-open");
  if ("response" in routed) return routed.response;
  const { runSignalOpenAfterPayment } = await import("./lib/signal-open-handler");
  return runSignalOpenAfterPayment(request, routed.continue);
}
