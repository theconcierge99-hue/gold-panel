/**
 * Dispatched from api/[...path].ts (root shim → backend/api). Handlers live in
 * backend/concierge-api/ so Vercel does not register each file as its own function.
 */
import { handleConciergeIntelRoute, resolveIntelKindFromRequest } from "./concierge-intel-handler";
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
import handleWellKnownAgentCard from "./routes/well-known-agent-card";
import handleWellKnownX402 from "./routes/well-known-x402";
import handleX402Config from "./routes/x402-config";
import handleZauthDirectory from "./routes/zauth-directory";
import handleZauthStatus from "./routes/zauth-status";

type RouteHandler = (request: Request) => Promise<Response>;

const EXACT_ROUTES: Record<string, RouteHandler> = {
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
  "/api/well-known-agent-card": handleWellKnownAgentCard,
  "/api/well-known-x402": handleWellKnownX402,
  "/api/x402-config": handleX402Config,
  "/api/zauth-directory": handleZauthDirectory,
  "/api/zauth-status": handleZauthStatus,
};

export async function dispatchApiRoute(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  const intelKind = resolveIntelKindFromRequest(request);
  if (intelKind) {
    return handleConciergeIntelRoute(request, intelKind);
  }

  const handler = EXACT_ROUTES[pathname];
  if (handler) return handler(request);

  return Promise.resolve(
    new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }),
  );
}
