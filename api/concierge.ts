import handleConcierge from "../lib/concierge-api/routes/concierge";

/** Node + Fluid Compute — trading plans exceed Vercel Edge's ~30s wall clock. */
export const maxDuration = 60;

export default function handler(request: Request): Promise<Response> {
  return handleConcierge(request);
}
