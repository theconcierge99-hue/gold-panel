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
import { solanaRwaMintConfigured } from "./creator-payout-env";
import { internalAuthHeaders, loungeApiOrigin } from "./lounge-internal-auth";
import { mintSignalRwaToken } from "./rwa-token";
import type { SolanaRwaMintResult } from "./rwa-types";
import { savePublishedSignal, signalStoreReady } from "./signal-store";
import type { CreatorSignal } from "./signals-types";

function newSignalId(): string {
  return `sig_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Trigger Metaplex mint on a separate route (Edge publish must not load mpl-token-metadata). */
function queueSolanaNftMint(signalId: string): void {
  const origin = loungeApiOrigin();
  const job = async () => {
    try {
      const res = await fetch(`${origin}/api/lounge-rwa-mint-sol`, {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ signalId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[signal-publish] rwa-mint-sol", res.status, text.slice(0, 200));
      }
    } catch (e) {
      console.error("[signal-publish] bg sol mint", e instanceof Error ? e.message : e);
    }
  };
  void import("@vercel/functions")
    .then((m) => m.waitUntil(job()))
    .catch(() => {
      void job();
    });
}

/** Paid POST body only — import dynamically from api/signal-publish.ts so cold start can return 402. */
export async function runSignalPublishAfterPayment(
  request: Request,
  { cors, gate }: PaidX402RouteContinue,
): Promise<Response> {
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

    try {
      rwaToken = await mintSignalRwaToken(signal);
      signal.rwaTokenId = rwaToken.tokenId;
      await savePublishedSignal(signal);

      if (signal.creatorChain === "sol" && solanaRwaMintConfigured()) {
        solanaMint = {
          status: "pending",
          reason: "NFT mint queued — check your Solana wallet in ~1 minute",
        };
        queueSolanaNftMint(signal.id);
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

    return new Response(
      JSON.stringify({
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
      }),
      { status: 200, headers },
    );
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
