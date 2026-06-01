import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import type { PaidX402RouteContinue } from "./x402-server";
import { guardPaidX402Api } from "./x402-server";
import { X402_SIGNAL_PUBLISH_USDC } from "./x402-pricing";
import { ingestCreatorSignalMemory } from "./lounge-memory";
import { parseSignalPublishBody } from "./signal-validation";
import { rwaMetadataUri } from "./rwa-metadata-json";
import { mintSignalRwaToken, siteOrigin } from "./rwa-token";
import type { SolanaRwaMintResult } from "./rwa-types";
import { savePublishedSignal, signalStoreReady } from "./signal-store";
import type { CreatorSignal } from "./signals-types";
import { truncateOnChainMetaName } from "../../lib/on-chain-meta";
import { reportPaidRouteToZauth } from "./zauth-paid-response";

function newSignalId(): string {
  return `sig_${crypto.randomUUID().replace(/-/g, "")}`;
}

function validCollectionMint(addr: string | undefined): string | undefined {
  const a = addr?.trim();
  if (!a || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return undefined;
  return a;
}

/** Paid POST body only — import dynamically from api/lounge-signal-publish.ts so cold start can return 402. */
export async function runSignalPublishAfterPayment(
  request: Request,
  { cors, gate }: PaidX402RouteContinue,
): Promise<Response> {
  const startedAt = Date.now();
  try {
    assertAllowedOrigin(request);

    if (!signalStoreReady()) {
      return new Response(
        JSON.stringify({
          error: "Signal storage not configured",
          detail:
            "Add Vercel KV or Upstash Redis (KV_REST_API_URL + KV_REST_API_TOKEN) in production.",
        }),
        {
          status: 503,
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
        },
      );
    }

    const raw = await readBodyWithLimit(request);
    const body =
      typeof raw === "string"
        ? parseSignalPublishBody(raw)
        : parseSignalPublishBody(JSON.stringify(raw ?? {}));

    const signal: CreatorSignal = {
      id: newSignalId(),
      title: body.title,
      summary: body.summary,
      categories: body.categories,
      creatorWallet: body.creatorWallet,
      creatorChain: body.creatorChain,
      publishedAt: new Date().toISOString(),
      publishTx: gate.transaction || undefined,
      publishPayer: gate.payer !== "dev-bypass" ? gate.payer : undefined,
    };

    // Persist first — user already paid via x402; never lose the signal on slow NFT mint
    await savePublishedSignal(signal);

    let rwaToken: Awaited<ReturnType<typeof mintSignalRwaToken>> | undefined;
    let solanaMint: SolanaRwaMintResult | undefined;
    let mintParams:
      | { signalId: string; uri: string; name: string; collectionMint?: string }
      | undefined;

    try {
      rwaToken = await mintSignalRwaToken(signal);
      signal.rwaTokenId = rwaToken.tokenId;
      await savePublishedSignal(signal);

      if (signal.creatorChain === "sol") {
        mintParams = {
          signalId: signal.id,
          uri: rwaMetadataUri(signal.id, siteOrigin()),
          name: truncateOnChainMetaName(signal.title),
          collectionMint: validCollectionMint(process.env.RWA_SIGNAL_CONTRACT_SOL),
        };
        solanaMint = {
          status: "pending",
          reason: "Confirm NFT mint in Phantom (~0.02 SOL network fee)",
        };
      }

      await ingestCreatorSignalMemory(signal);
    } catch (e) {
      console.error("[signal-publish] post-save", e instanceof Error ? e.message : e);
    }

    const headers: Record<string, string> = {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };
    if (gate.paymentResponseHeader) headers["PAYMENT-RESPONSE"] = gate.paymentResponseHeader;

    const payload = {
      ok: true,
      signal: {
        id: signal.id,
        title: signal.title,
        categories: signal.categories,
        publishedAt: signal.publishedAt,
      },
      publishFeeUsdc: X402_SIGNAL_PUBLISH_USDC,
      readerUnlockUsdc: 0.1,
      rwa: rwaToken
        ? {
            tokenId: rwaToken.tokenId,
            contentHash: rwaToken.contentHash,
            standard: rwaToken.standard,
            targetChain: rwaToken.targetChain,
            onChainMintAddress: rwaToken.onChainMintAddress,
            onChainMintTx: rwaToken.onChainMintTx,
            onChainMintStatus: rwaToken.onChainMintStatus ?? solanaMint?.status,
          }
        : undefined,
      solanaNft: solanaMint,
      mintParams,
    };
    reportPaidRouteToZauth(request, "signal-publish", 200, payload, startedAt, {
      payer: gate.payer,
      transaction: gate.transaction,
      paymentResponseHeader: gate.paymentResponseHeader,
    });
    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (e) {
    console.error("[signal-publish]", e instanceof Error ? e.stack || e.message : e);
    const msg = sanitizePublicError(e);
    const status =
      msg.includes("not allowed") || msg.includes("too large")
        ? 403
        : msg.includes("required") || msg.includes("Invalid") || msg.includes("must be")
          ? 400
          : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}

export async function handleSignalPublish(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-publish");
  if ("response" in routed) return routed.response;
  return runSignalPublishAfterPayment(request, routed.continue);
}
