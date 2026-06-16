/**
 * GET /api/token-pay — Token Pay platform + merchant registry (public).
 * Optional: ?merchant=acme · ?resource=concierge (readiness probe resource)
 */
import { corsHeadersFor } from "../concierge-security";
import { X402_READ_PRICE_USDC } from "../x402-pricing";
import {
  formatTokenPayUiFromAtomic,
  getDefaultTokenPayMerchant,
  getDefaultTokenPayMerchantId,
  getTokenPayMerchant,
  getTokenPayPlatformMeta,
  getTokenPayUsdRateAsync,
  isTokenPayMerchantLive,
  listTokenPayMerchants,
  toPublicMerchant,
  tokenPayAtomicForResourceAsync,
} from "../token-pay";
import { getTokenPayMerchantReadiness } from "../token-pay/readiness";

function siteOrigin(request: Request): string {
  const host = request.headers.get("host") || "conc-exe.xyz";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

async function enrichMerchantPublic(
  merchant: NonNullable<ReturnType<typeof getTokenPayMerchant>>,
  request: Request,
  resourceKind: string,
) {
  const base = toPublicMerchant(merchant);
  const origin = siteOrigin(request);
  const readiness = await getTokenPayMerchantReadiness(merchant, resourceKind, X402_READ_PRICE_USDC);

  if (!isTokenPayMerchantLive(merchant)) {
    return {
      ...base,
      conciergeAtomic: undefined,
      conciergeLabel: undefined,
      readiness,
      verify: {
        configUrl: `${origin}/api/token-pay?merchant=${encodeURIComponent(merchant.id)}`,
        x402ConfigUrl: `${origin}/api/x402-config`,
        probe402Url: `${origin}/api/concierge`,
        discoverUrl: `${origin}/agent/discover`,
        dashboardUrl: `${origin}/agent/token-pay?merchant=${encodeURIComponent(merchant.id)}`,
        analyticsUrl: `${origin}/api/token-pay-analytics?merchant=${encodeURIComponent(merchant.id)}`,
        buildAcceptUrl: `${origin}/api/token-pay-build-accept?merchant=${encodeURIComponent(merchant.id)}`,
        partnerVerifyUrl: `${origin}/api/token-pay-verify`,
        docsUrl: `${origin}/docs/payment/token-pay`,
      },
    };
  }

  const price = await getTokenPayUsdRateAsync(merchant);
  const atomic =
    price != null ? await tokenPayAtomicForResourceAsync(X402_READ_PRICE_USDC, merchant) : null;

  return {
    ...base,
    usdcRate: price?.usd,
    priceSource: price?.source,
    conciergeAtomic: atomic ?? undefined,
    conciergeLabel: atomic != null ? formatTokenPayUiFromAtomic(atomic, merchant) : undefined,
    payToReady: !!(merchant.payTo && merchant.mint),
    merchantTokenAta: readiness.checks.merchantTokenAta,
    readiness,
    verify: {
      configUrl: `${origin}/api/token-pay?merchant=${encodeURIComponent(merchant.id)}`,
      x402ConfigUrl: `${origin}/api/x402-config`,
      probe402Url: `${origin}/api/concierge`,
      discoverUrl: `${origin}/agent/discover`,
      dashboardUrl: `${origin}/agent/token-pay?merchant=${encodeURIComponent(merchant.id)}`,
      analyticsUrl: `${origin}/api/token-pay-analytics?merchant=${encodeURIComponent(merchant.id)}`,
      buildAcceptUrl: `${origin}/api/token-pay-build-accept?merchant=${encodeURIComponent(merchant.id)}`,
      partnerVerifyUrl: `${origin}/api/token-pay-verify`,
      docsUrl: `${origin}/docs/payment/token-pay`,
    },
  };
}

export default async function handleTokenPayConfig(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  const url = new URL(request.url);
  const merchantId = url.searchParams.get("merchant")?.trim();
  const resourceKind = (url.searchParams.get("resource") ?? "concierge").trim() || "concierge";

  if (merchantId) {
    const merchant = getTokenPayMerchant(merchantId);
    if (!merchant) {
      return new Response(JSON.stringify({ error: "Merchant not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const enriched = await enrichMerchantPublic(merchant, request, resourceKind);
    return new Response(JSON.stringify({ merchant: enriched, resourceKind }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  }

  const def = getDefaultTokenPayMerchant();
  const merchants = await Promise.all(
    listTokenPayMerchants().map((m) => enrichMerchantPublic(m, request, resourceKind)),
  );
  const readyCount = merchants.filter((m) => m.readiness.acceptReady).length;

  return new Response(
    JSON.stringify({
      platform: getTokenPayPlatformMeta(),
      defaultMerchantId: getDefaultTokenPayMerchantId(),
      defaultMerchant: merchants.find((m) => m.id === def.id) ?? merchants[0],
      merchants,
      liveMerchantCount: merchants.filter((m) => m.live && m.conciergeAtomic).length,
      acceptReadyCount: readyCount,
      resourceKind,
      verify: {
        discoverUrl: `${siteOrigin(request)}/agent/discover`,
        dashboardUrl: `${siteOrigin(request)}/agent/token-pay`,
        analyticsUrl: `${siteOrigin(request)}/api/token-pay-analytics`,
        buildAcceptUrl: `${siteOrigin(request)}/api/token-pay-build-accept`,
        partnerVerifyUrl: `${siteOrigin(request)}/api/token-pay-verify`,
        docsUrl: `${siteOrigin(request)}/docs/payment/token-pay`,
        probe402Hint:
          "POST /api/concierge without PAYMENT-SIGNATURE → decode PAYMENT-REQUIRED → find accept with extra.merchantId",
      },
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    },
  );
}
