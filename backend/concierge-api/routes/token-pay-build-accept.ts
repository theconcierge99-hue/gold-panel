/**
 * GET/POST /api/token-pay-build-accept — server-built x402 accept for partner APIs.
 * ?merchant=acme&usd=0.10&resourceUrl=https://api.acme.xyz/v1/intel
 */
import { corsHeadersFor, readBodyWithLimit } from "../concierge-security";
import { getTokenPayMerchant } from "../token-pay";
import {
  assertPartnerOrigin,
  buildTokenPayPartnerAcceptAsync,
  clampPartnerUsdAmount,
} from "../token-pay/partner";

function siteOrigin(request: Request): string {
  const host = request.headers.get("host") || "conc-exe.xyz";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function optionsResponse(cors: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: cors });
}

async function parseInput(
  request: Request,
): Promise<{ merchantId: string; usdAmount: number; resourceUrl?: string }> {
  if (request.method === "POST") {
    const body = (await readBodyWithLimit(request)) as Record<string, unknown>;
    const merchantId = String(body.merchantId ?? body.merchant ?? "").trim();
    const usdAmount = clampPartnerUsdAmount(body.usdAmount ?? body.usd);
    const resourceUrl =
      typeof body.resourceUrl === "string" ? body.resourceUrl.trim() : undefined;
    if (!merchantId) throw new Error("merchantId is required");
    return { merchantId, usdAmount, resourceUrl };
  }

  const url = new URL(request.url);
  const merchantId = url.searchParams.get("merchant")?.trim() ?? "";
  const usdRaw = url.searchParams.get("usd") ?? url.searchParams.get("usdAmount") ?? "0.1";
  const resourceUrl = url.searchParams.get("resourceUrl")?.trim() || undefined;
  if (!merchantId) throw new Error("merchant query param is required");
  return { merchantId, usdAmount: clampPartnerUsdAmount(Number(usdRaw)), resourceUrl };
}

export default async function handleTokenPayBuildAccept(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  if (request.method === "OPTIONS") return optionsResponse(cors);
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const input = await parseInput(request);
    const merchant = getTokenPayMerchant(input.merchantId);
    if (!merchant) {
      return new Response(JSON.stringify({ error: "Merchant not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    assertPartnerOrigin(request, merchant);

    const built = await buildTokenPayPartnerAcceptAsync(input);
    const origin = siteOrigin(request);

    return new Response(
      JSON.stringify({
        ...built,
        links: {
          verifyUrl: `${origin}/api/token-pay-verify`,
          configUrl: `${origin}/api/token-pay?merchant=${encodeURIComponent(input.merchantId)}`,
          docsUrl: `${origin}/docs/payment/token-pay`,
        },
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    const status = msg.includes("not found") ? 404 : msg.includes("Origin not allowed") ? 403 : 400;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
