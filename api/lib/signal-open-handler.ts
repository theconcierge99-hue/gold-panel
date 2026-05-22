import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import { guardPaidX402Api } from "./x402-server";
import { X402_READ_PRICE_ATOMIC, X402_READ_PRICE_USDC } from "./x402-pricing";
import {
  SIGNAL_CREATOR_SHARE_BPS,
  SIGNAL_MERCHANT_SHARE_BPS,
  splitReaderUnlockAtomic,
} from "./signal-revenue";
import { parseSignalOpenBody } from "./signal-validation";
import { appendUnlockLedger, getSignalById } from "./signal-store";

export async function handleSignalOpen(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "signal-open");
  if ("response" in routed) return routed.response;
  const { cors, gate } = routed.continue;

  try {
    assertAllowedOrigin(request);

    const raw = await readBodyWithLimit(request);
    const { signalId } =
      typeof raw === "string"
        ? parseSignalOpenBody(raw)
        : parseSignalOpenBody(JSON.stringify(raw ?? {}));

    const signal = await getSignalById(signalId);
    if (!signal) {
      return new Response(JSON.stringify({ error: "Signal not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (gate.payer && gate.payer !== "dev-bypass" && gate.transaction) {
      const split = splitReaderUnlockAtomic(X402_READ_PRICE_ATOMIC);
      await appendUnlockLedger({
        type: "signal_unlock",
        signalId: signal.id,
        creatorWallet: signal.creatorWallet,
        payer: gate.payer,
        amountAtomic: X402_READ_PRICE_ATOMIC,
        creatorShareAtomic: split.creatorAtomic,
        merchantShareAtomic: split.merchantAtomic,
        creatorShareBps: SIGNAL_CREATOR_SHARE_BPS,
        merchantShareBps: SIGNAL_MERCHANT_SHARE_BPS,
        transaction: gate.transaction,
        at: new Date().toISOString(),
      });
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
        priceUsdc: X402_READ_PRICE_USDC,
        signal: {
          id: signal.id,
          title: signal.title,
          summary: signal.summary,
          categories: signal.categories,
          creatorWallet: signal.creatorWallet,
          creatorChain: signal.creatorChain,
          publishedAt: signal.publishedAt,
        },
      }),
      { status: 200, headers },
    );
  } catch (e) {
    const msg = sanitizePublicError(e);
    const status =
      msg.includes("not allowed") || msg.includes("too large")
        ? 403
        : msg.includes("required") || msg.includes("Invalid")
          ? 400
          : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
