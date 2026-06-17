import { resourceUrlForOrigin, resolveX402SiteOrigin } from "./x402-discovery";
import type { X402ResourceKind } from "./x402-pricing";
import { scheduleZauthProviderReport } from "./zauth";

const EXPECTED_BY_KIND: Partial<Record<X402ResourceKind, string>> = {
  concierge:
    "JSON with HTML reply field (institutional trading analysis or chat); topics and marketLive optional",
  news: "JSON with article URL or redirect target after successful unlock",
  "signal-publish": "JSON with published signal id, RWA metadata, optional mintParams for Solana NFT",
  "signal-open": "JSON with signalId and full intelligence summary fields",
  "intel-tvl": "JSON with chains[] and topProtocols[] TVL snapshot",
  "intel-yields": "JSON with pools[] screened yield rows",
  "intel-whales": "JSON with positioning[] top-trader ratios",
  "intel-wallet": "JSON with wallet chain, address, summary",
  "intel-verdict": "JSON with verdict signal, confidence, rationale, optional insider[]",
  "intel-airdrop": "JSON with summary and candidates[] (insider-first airdrop desk)",
  "intel-listing": "JSON with summary and candidates[] (listing catalyst desk)",
  "intel-momentum": "JSON with summary and candidates[] (large-move up/down desk)",
  "intel-scalp": "JSON with 5m/15m TA for BTC/ETH/BNB/SOL USDT (RSI, EMA, levels, perp overlay)",
  "intel-macro": "JSON with marks[], sentiment, macro yields/events/headlines",
  "intel-wire": "JSON with headlines[] from live RSS and Lounge wire memory",
};

/** Report successful paid responses to zauth Provider Hub (no-op without ZAUTH_API_KEY). */
export function reportPaidRouteToZauth(
  request: Request,
  kind: X402ResourceKind,
  statusCode: number,
  responseBody: unknown,
  startedAt: number,
  payMeta?: { payer?: string; transaction?: string; paymentResponseHeader?: string | null },
): void {
  scheduleZauthProviderReport({
    request,
    resourceUrl: resourceUrlForOrigin(resolveX402SiteOrigin(request), kind),
    statusCode,
    responseBody,
    responseTimeMs: Math.max(0, Date.now() - startedAt),
    payer: payMeta?.payer,
    transaction: payMeta?.transaction,
    paymentResponseHeader: payMeta?.paymentResponseHeader,
    expectedResponse: EXPECTED_BY_KIND[kind],
  });
}
