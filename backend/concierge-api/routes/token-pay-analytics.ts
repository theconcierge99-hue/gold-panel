/**
 * GET /api/token-pay-analytics — per-merchant Token Pay stats (beta dashboard).
 * ?merchant=acme · ?days=14
 */
import { corsHeadersFor } from "../concierge-security";
import { getTokenPayMerchant, listTokenPayMerchants } from "../token-pay";
import { getTokenPayMerchantAnalytics } from "../token-pay/analytics-store";
import { getTokenPayMerchantReadiness } from "../token-pay/readiness";
import { X402_READ_PRICE_USDC } from "../x402-config";

export default async function handleTokenPayAnalytics(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  const url = new URL(request.url);
  const merchantId = url.searchParams.get("merchant")?.trim();
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 14) || 14, 1), 90);
  const resourceKind = (url.searchParams.get("resource") ?? "concierge").trim() || "concierge";

  if (!merchantId) {
    const merchants = listTokenPayMerchants().map((m) => ({
      id: m.id,
      symbol: m.symbol,
      live: !!m.mint,
    }));
    return new Response(JSON.stringify({ merchants, hint: "Pass ?merchant=YOUR_ID" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
    });
  }

  const merchant = getTokenPayMerchant(merchantId);
  if (!merchant) {
    return new Response(JSON.stringify({ error: "Merchant not found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const [analytics, readiness] = await Promise.all([
    getTokenPayMerchantAnalytics(merchantId, days),
    getTokenPayMerchantReadiness(merchant, resourceKind, X402_READ_PRICE_USDC),
  ]);

  return new Response(
    JSON.stringify({
      merchantId,
      symbol: merchant.symbol,
      days,
      analytics,
      readiness,
      links: {
        config: `/api/token-pay?merchant=${encodeURIComponent(merchantId)}`,
        solscanTx: "https://solscan.io/tx/",
        solscanAccount: "https://solscan.io/account/",
        docs: "/docs/payment/token-pay",
      },
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
    },
  );
}
