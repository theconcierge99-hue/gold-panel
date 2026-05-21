import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizeNewsOpenError,
} from "./lib/concierge-security";
import { requireX402Payment } from "./lib/x402-server";

/** Edge + PayAI HTTP facilitator (no Node-only @x402 server SDK) */
export const config = {
  runtime: "edge",
};

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

    const gate = await requireX402Payment(request, "news", cors);
    if (!gate.ok) return gate.response;

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

    return new Response(
      JSON.stringify({
        ok: true,
        url: article.url,
        title: article.title,
        source: article.source,
        priceUsdc: 0.1,
      }),
      { status: 200, headers },
    );
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
