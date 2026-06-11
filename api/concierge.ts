import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleConcierge from "../lib/concierge-api/routes/concierge";
import { runWebHandler } from "../lib/concierge-api/vercel-node-bridge";

/** Node + Fluid Compute — trading plans exceed Vercel Edge's ~30s wall clock. */
export const maxDuration = 60;

export default function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  return runWebHandler(req, res, "/api/concierge", handleConcierge);
}
