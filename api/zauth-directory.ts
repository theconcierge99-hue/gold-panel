import { corsHeadersFor, sanitizePublicError } from "./lib/concierge-security";
import { fetchZauthDirectory, zauthMetaLinks } from "./lib/zauth";
import { resolveX402SiteOrigin } from "./lib/x402-discovery";

export const config = { runtime: "edge" };

/** Proxy to zauth x402 directory — agents query before paying third-party endpoints. */
export default async function handler(request: Request): Promise<Response> {
  const cors = { ...corsHeadersFor(request), "Access-Control-Allow-Origin": "*" };

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
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const network = url.searchParams.get("network") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const verifiedParam = url.searchParams.get("verified");
    const verified =
      verifiedParam === "true" ? true : verifiedParam === "false" ? false : undefined;
    const limit = Number(url.searchParams.get("limit") || "50");
    const offset = Number(url.searchParams.get("offset") || "0");

    const data = await fetchZauthDirectory({ search, network, status, verified, limit, offset });
    return new Response(
      JSON.stringify({
        ...data,
        source: "zauth.inc",
        links: zauthMetaLinks(resolveX402SiteOrigin(request)),
      }),
      {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: sanitizePublicError(e) }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
