/**
 * Dispatched from api/[...path].ts (root shim → backend/api). Handlers live in
 * backend/concierge-api/ so Vercel does not register each file as its own function.
 */
import {
  checkApiRateLimit,
  mergeAgentReadinessHeaders,
  rateLimitedJsonResponse,
  siteOriginFromRequest,
  type RateLimitState,
} from "./agent-readiness";
import {
  handleConciergeIntelRoute,
  resolveIntelKindFromRequest,
} from "./concierge-intel-handler";
import {
  handleConciergeSecurityRoute,
  handleSecurityScopeRoute,
  isSecurityScopeRoute,
  resolveSecurityKindFromRequest,
} from "./concierge-security-handler";
import handleAgentA2aMesh from "./routes/agent-a2a-mesh";
import handleAgentIdentity from "./routes/agent-identity";
import handleAgentIdentityCard from "./routes/agent-identity-card";
import handleConcierge from "./routes/concierge";
import handleLoungeRwaRecordMint from "./routes/lounge-rwa-record-mint";
import handleLoungeSignalOpen from "./routes/lounge-signal-open";
import handleLoungeSignalPublish from "./routes/lounge-signal-publish";
import handleMarket from "./routes/market";
import handleMppscanRedirect from "./routes/mppscan-redirect";
import handleNewsOpen from "./routes/news-open";
import handleOpenapi from "./routes/openapi";
import handlePrivyConfig from "./routes/privy-config";
import handleCreatorPoints from "./routes/creator-points";
import handleRwaBadges from "./routes/rwa-badges";
import handleRwaMetadata from "./routes/rwa-metadata";
import handleRwaToken from "./routes/rwa-token";
import handleSolUsdcBalance from "./routes/sol-usdc-balance";
import handleTokenPayAnalytics from "./routes/token-pay-analytics";
import handleTokenPayBuildAccept from "./routes/token-pay-build-accept";
import handleTokenPayConfig from "./routes/token-pay-config";
import handleTokenPayPreview from "./routes/token-pay-preview";
import handleTokenPayVerify from "./routes/token-pay-verify";
import handleSolanaRpc from "./routes/solana-rpc";
import handleSolanaRpcSend from "./routes/solana-rpc-send";
import handleIntelAccuracy from "./routes/intel-accuracy";
import handleMcp from "./routes/mcp";
import handleWellKnownAgentCard from "./routes/well-known-agent-card";
import handleWellKnownX402 from "./routes/well-known-x402";
import handleX402Config from "./routes/x402-config";
import handleZauthDirectory from "./routes/zauth-directory";
import handleZauthStatus from "./routes/zauth-status";

type RouteHandler = (request: Request) => Promise<Response>;

function withAgentReadinessHeaders(
  response: Response,
  request: Request,
  rateLimit: RateLimitState,
): Response {
  const origin = siteOriginFromRequest(request);
  const merged = mergeAgentReadinessHeaders({}, origin, rateLimit);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(merged)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function dispatchHandler(
  request: Request,
  handler: RouteHandler,
  rateLimit: RateLimitState,
): Promise<Response> {
  const response = await handler(request);
  return withAgentReadinessHeaders(response, request, rateLimit);
}

const EXACT_ROUTES: Record<string, RouteHandler> = {
  "/api/agent-a2a-mesh": handleAgentA2aMesh,
  "/api/agent-identity": handleAgentIdentity,
  "/api/agent-identity-card": handleAgentIdentityCard,
  "/api/concierge": handleConcierge,
  "/api/lounge-rwa-record-mint": handleLoungeRwaRecordMint,
  "/api/lounge-signal-open": handleLoungeSignalOpen,
  "/api/lounge-signal-publish": handleLoungeSignalPublish,
  "/api/market": handleMarket,
  "/api/mppscan-redirect": handleMppscanRedirect,
  "/api/news-open": handleNewsOpen,
  "/api/openapi": handleOpenapi,
  "/api/privy-config": handlePrivyConfig,
  "/api/creator-points": handleCreatorPoints,
  "/api/rwa-badges": handleRwaBadges,
  "/api/rwa-metadata": handleRwaMetadata,
  "/api/rwa-token": handleRwaToken,
  "/api/sol-usdc-balance": handleSolUsdcBalance,
  "/api/token-pay": handleTokenPayConfig,
  "/api/token-pay-analytics": handleTokenPayAnalytics,
  "/api/token-pay-build-accept": handleTokenPayBuildAccept,
  "/api/token-pay-preview": handleTokenPayPreview,
  "/api/token-pay-verify": handleTokenPayVerify,
  "/api/solana-rpc": handleSolanaRpc,
  "/api/solana-rpc-send": handleSolanaRpcSend,
  "/api/concierge-intel-accuracy": handleIntelAccuracy,
  "/api/mcp": handleMcp,
  "/api/well-known-agent-card": handleWellKnownAgentCard,
  "/api/well-known-x402": handleWellKnownX402,
  "/api/x402-config": handleX402Config,
  "/api/zauth-directory": handleZauthDirectory,
  "/api/zauth-status": handleZauthStatus,
};

export async function dispatchApiRoute(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const rateLimit = checkApiRateLimit(request);
  if (!rateLimit.allowed) {
    return rateLimitedJsonResponse(request, rateLimit);
  }

  const intelKind = resolveIntelKindFromRequest(request);
  if (intelKind) {
    return dispatchHandler(request, (req) => handleConciergeIntelRoute(req, intelKind), rateLimit);
  }

  const securityKind = resolveSecurityKindFromRequest(request);
  if (securityKind) {
    return dispatchHandler(
      request,
      (req) => handleConciergeSecurityRoute(req, securityKind),
      rateLimit,
    );
  }

  if (isSecurityScopeRoute(request)) {
    return dispatchHandler(request, handleSecurityScopeRoute, rateLimit);
  }

  const handler = EXACT_ROUTES[pathname];
  if (handler) return dispatchHandler(request, handler, rateLimit);

  return withAgentReadinessHeaders(
    new Response(JSON.stringify({ error: "Not found", code: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }),
    request,
    rateLimit,
  );
}
