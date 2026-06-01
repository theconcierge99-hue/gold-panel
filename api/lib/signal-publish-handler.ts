import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import { guardPaidX402Api } from "./x402-server";
import { X402_SIGNAL_PUBLISH_USDC } from "./x402-pricing";
import { ingestCreatorSignalMemory } from "./lounge-memory";
import { parseSignalPublishBody } from "./signal-validation";
import { mintSignalRwaToken } from "./rwa-token";
import { savePublishedSignal, signalStoreReady } from "./signal-store";
import type { CreatorSignal } from "./signals-types";

function newSignalId(): string {
  return `sig_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function handleSignalPublish(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-publish");
  if ("response" in routed) return routed.response;
  const { cors, gate } = routed.continue;

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

    let rwaToken: Awaited<ReturnType<typeof mintSignalRwaToken>> | undefined;
    try {
      rwaToken = await mintSignalRwaToken(signal);
      signal.rwaTokenId = rwaToken.tokenId;
      await savePublishedSignal(signal);
    } catch (e) {
      console.error("[signal-publish] rwa mint", e instanceof Error ? e.message : e);
      await savePublishedSignal(signal);
    }
    try {
      await ingestCreatorSignalMemory(signal);
    } catch (e) {
      console.error("[signal-publish] lounge memory", e instanceof Error ? e.message : e);
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
            }
          : undefined,
      }),
      { status: 200, headers },
    );
  } catch (e) {
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
