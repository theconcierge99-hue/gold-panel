import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import { requireX402Payment } from "./x402-server";
import { X402_SIGNAL_PUBLISH_USDC } from "./x402-pricing";
import { parseSignalPublishBody } from "./signal-validation";
import { savePublishedSignal, signalStoreReady } from "./signal-store";
import type { CreatorSignal } from "./signals-types";

function newSignalId(): string {
  return `sig_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function handleSignalPublish(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

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

    const gate = await requireX402Payment(request, "signal-publish", cors);
    if (!gate.ok) return gate.response;

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

    await savePublishedSignal(signal);

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
