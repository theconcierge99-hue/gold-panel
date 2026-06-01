import { corsHeadersFor, sanitizePublicError } from "./lib/concierge-security";
import { resolveX402SiteOrigin } from "./lib/x402-discovery";
import {
  fetchZauthEndpointsForOrigin,
  isZauthProviderEnabled,
  zauthMetaLinks,
} from "./lib/zauth";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const origin = resolveX402SiteOrigin(request);
    const status = await fetchZauthEndpointsForOrigin(origin);
    return new Response(
      JSON.stringify({
        ...status,
        providerTelemetryEnabled: isZauthProviderEnabled(),
        links: zauthMetaLinks(origin),
      }),
      {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120",
        },
      },
    );
  } catch (e) {
    const msg = sanitizePublicError(e);
    return new Response(JSON.stringify({ error: msg, links: zauthMetaLinks(resolveX402SiteOrigin(request)) }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
