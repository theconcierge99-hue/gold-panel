/**
 * POST /api/token-pay-verify — settle Token Pay on partner-owned APIs (external resource).
 * Body: { merchantId, usdAmount, resourceUrl? } + PAYMENT-SIGNATURE header.
 */
import { corsHeadersFor, readBodyWithLimit } from "../concierge-security";
import { getTokenPayMerchant } from "../token-pay";
import { b64DecodeJson, b64EncodeJson } from "../token-pay/b64-json";
import type { TokenPayPaymentPayload } from "../token-pay/types";
import {
  assertPartnerOrigin,
  clampPartnerUsdAmount,
  TOKEN_PAY_EXTERNAL_RESOURCE_KIND,
  verifyTokenPayPartnerPayment,
} from "../token-pay/partner";

function getPaymentSignatureHeader(request: Request): string | null {
  return request.headers.get("payment-signature") ?? request.headers.get("PAYMENT-SIGNATURE");
}

function optionsResponse(cors: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: cors });
}

export default async function handleTokenPayVerify(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);
  if (request.method === "OPTIONS") return optionsResponse(cors);
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await readBodyWithLimit(request)) as Record<string, unknown>;
    const merchantId = String(body.merchantId ?? body.merchant ?? "").trim();
    if (!merchantId) throw new Error("merchantId is required");

    const merchant = getTokenPayMerchant(merchantId);
    if (!merchant) {
      return new Response(JSON.stringify({ error: "Merchant not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    assertPartnerOrigin(request, merchant);

    const sigHeader = getPaymentSignatureHeader(request);
    if (!sigHeader) throw new Error("PAYMENT-SIGNATURE header is required");

    const paymentPayload = b64DecodeJson<TokenPayPaymentPayload>(sigHeader);
    if (!paymentPayload) throw new Error("Invalid PAYMENT-SIGNATURE header");

    const usdAmount = clampPartnerUsdAmount(body.usdAmount ?? body.usd);
    const resourceUrl =
      typeof body.resourceUrl === "string" ? body.resourceUrl.trim() : undefined;

    const settle = await verifyTokenPayPartnerPayment({
      paymentPayload,
      merchantId,
      usdAmount,
      resourceUrl,
    });

    const paymentResponse = {
      success: true,
      transaction: settle.transaction,
      network: settle.network,
      payer: settle.payer,
      merchantId,
      resourceKind: TOKEN_PAY_EXTERNAL_RESOURCE_KIND,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        ...settle,
        merchantId,
        resourceKind: TOKEN_PAY_EXTERNAL_RESOURCE_KIND,
        resourceUrl,
      }),
      {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "PAYMENT-RESPONSE": b64EncodeJson(paymentResponse),
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    const status =
      msg.includes("not found") ? 404
      : msg.includes("Origin not allowed") ? 403
      : msg.includes("PAYMENT-SIGNATURE") || msg.includes("does not match") ? 402
      : 400;
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
