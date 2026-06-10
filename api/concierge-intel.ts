import {
  handleConciergeIntelRoute,
  resolveIntelKindFromRequest,
} from "./lib/concierge-intel-handler";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  const kind = resolveIntelKindFromRequest(request);
  if (!kind) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: "Unknown intel route" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return handleConciergeIntelRoute(request, kind);
}
