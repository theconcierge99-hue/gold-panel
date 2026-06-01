import { guardPaidX402Api } from "./lib/x402-server";

/** Edge — unlock creator signal (replaces broken /api/signal-open deployment) */
export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-open");
  if ("response" in routed) return routed.response;
  const { runSignalOpenAfterPayment } = await import("./lib/signal-open-handler");
  return runSignalOpenAfterPayment(request, routed.continue);
}
