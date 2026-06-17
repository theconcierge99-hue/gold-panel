/**
 * POST /api/token-pay-preview — validate a proposed merchant config without persisting.
 * Used by the onboarding wizard before partners add TOKEN_PAY_MERCHANTS_JSON to env.
 */
import { corsHeadersFor } from "../concierge-security";
import { X402_READ_PRICE_USDC } from "../x402-pricing";
import {
  buildMerchantEnvSnippet,
  getTokenPayMerchant,
  parseMerchantJsonRow,
  toPublicMerchant,
  type JsonMerchantRow,
} from "../token-pay/registry";
import { getTokenPayMerchantReadiness } from "../token-pay/readiness";
import { formatTokenPayUiFromAtomic, getTokenPayUsdRateAsync, tokenPayAtomicForResourceAsync } from "../token-pay/x402";

type PreviewBody = {
  merchant?: JsonMerchantRow;
  resourceKind?: string;
};

export default async function handleTokenPayPreview(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  let body: PreviewBody;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const row = body.merchant;
  if (!row || typeof row !== "object") {
    return new Response(JSON.stringify({ error: "merchant object is required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const resourceKind = (body.resourceKind ?? "external").trim() || "external";
  const { merchant, errors } = parseMerchantJsonRow(row);

  if (!merchant) {
    return new Response(
      JSON.stringify({
        valid: false,
        errors,
        envSnippet: buildMerchantEnvSnippet(row),
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  }

  const existing = getTokenPayMerchant(merchant.id);
  const readiness = await getTokenPayMerchantReadiness(merchant, resourceKind, X402_READ_PRICE_USDC);
  const price = await getTokenPayUsdRateAsync(merchant);
  const atomic =
    price != null ? await tokenPayAtomicForResourceAsync(X402_READ_PRICE_USDC, merchant) : null;

  const warnings: string[] = [];
  if (existing) {
    warnings.push(
      `Merchant id "${merchant.id}" is already registered on this deployment — redeploy will replace the existing row`,
    );
  }
  if (merchant.price.source === "dexscreener" && !merchant.price.fallbackUsd) {
    warnings.push("Set fallbackUsd as backup when DexScreener has no pair for your mint");
  }
  if (resourceKind === "external" && !merchant.resourceKinds.includes("external")) {
    warnings.push('Add "external" to resourceKinds to gate your own API');
  }

  return new Response(
    JSON.stringify({
      valid: errors.length === 0,
      errors,
      warnings,
      alreadyRegistered: !!existing,
      resourceKind,
      merchant: {
        ...toPublicMerchant(merchant),
        usdcRate: price?.usd,
        conciergeAtomic: atomic ?? undefined,
        conciergeLabel: atomic != null ? formatTokenPayUiFromAtomic(atomic, merchant) : undefined,
        readiness,
      },
      envSnippet: buildMerchantEnvSnippet(row),
      deploySteps: [
        "Copy envSnippet into Vercel → Project → Settings → Environment Variables (or local .env)",
        "If you already have TOKEN_PAY_MERCHANTS_JSON, merge this object into the JSON array (max 16 merchants)",
        "Redeploy conc-exe.xyz (or your fork)",
        `Open /agent/token-pay?merchant=${merchant.id} and confirm readiness.status === "ready"`,
        "Run one test payment via build-accept → wallet sign → token-pay-verify",
      ],
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
