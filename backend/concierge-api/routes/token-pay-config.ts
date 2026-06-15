/**
 * GET /api/token-pay — Token Pay platform + merchant registry (public).
 */
import { corsHeadersFor } from "../concierge-security";
import {
  getDefaultTokenPayMerchant,
  getDefaultTokenPayMerchantId,
  getTokenPayMerchant,
  getTokenPayPlatformMeta,
  listTokenPayMerchants,
  toPublicMerchant,
} from "../token-pay";

export default async function handleTokenPayConfig(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  const url = new URL(request.url);
  const merchantId = url.searchParams.get("merchant")?.trim();

  if (merchantId) {
    const merchant = getTokenPayMerchant(merchantId);
    if (!merchant) {
      return new Response(JSON.stringify({ error: "Merchant not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return new Response(JSON.stringify({ merchant: toPublicMerchant(merchant) }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  }

  const def = getDefaultTokenPayMerchant();
  return new Response(
    JSON.stringify({
      platform: getTokenPayPlatformMeta(),
      defaultMerchantId: getDefaultTokenPayMerchantId(),
      defaultMerchant: toPublicMerchant(def),
      merchants: listTokenPayMerchants().map(toPublicMerchant),
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    },
  );
}
