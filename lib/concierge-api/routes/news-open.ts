import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizeNewsOpenError,
} from "../concierge-security";
import { reportPaidRouteToZauth } from "../zauth-paid-response";
import { guardPaidX402Api } from "../x402-server";

/** Edge + PayAI HTTP facilitator (no Node-only @x402 server SDK) */
const MAX_URL_LEN = 2048;
const MAX_TITLE_LEN = 500;
const MAX_SOURCE_LEN = 120;

function sanitizeArticleUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LEN) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function parseNewsOpenBody(raw: string): { url: string; title: string; source: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!data || typeof data !== "object") throw new Error("Invalid request body");
  const o = data as Record<string, unknown>;
  const url = sanitizeArticleUrl(String(o.url ?? ""));
  if (!url) throw new Error("Valid article url is required");
  const title = String(o.title ?? "")
    .trim()
    .slice(0, MAX_TITLE_LEN);
  const source = String(o.source ?? "")
    .trim()
    .slice(0, MAX_SOURCE_LEN);
  return { url, title, source };
}

export default async function handler(request: Request): Promise<Response> {
  const routed = await guardPaidX402Api(request, "news");
  if ("response" in routed) return routed.response;
  const { cors, gate } = routed.continue;
  const startedAt = Date.now();

  try {
    assertAllowedOrigin(request);

    const raw = await readBodyWithLimit(request);
    const article =
      typeof raw === "string"
        ? parseNewsOpenBody(raw)
        : parseNewsOpenBody(JSON.stringify(raw ?? {}));

    const headers: Record<string, string> = {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };
    if (gate.paymentResponseHeader) headers["PAYMENT-RESPONSE"] = gate.paymentResponseHeader;

    const payload = {
      ok: true,
      url: article.url,
      title: article.title,
      source: article.source,
      priceUsdc: 0.1,
    };
    reportPaidRouteToZauth(request, "news", 200, payload, startedAt, {
      payer: gate.payer,
      transaction: gate.transaction,
      paymentResponseHeader: gate.paymentResponseHeader,
    });
    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (e) {
    const msg = sanitizeNewsOpenError(e);
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
