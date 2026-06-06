import { handleConciergeIntelRoute } from "./lib/concierge-intel-handler";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleConciergeIntelRoute(request, "intel-airdrop");
}
