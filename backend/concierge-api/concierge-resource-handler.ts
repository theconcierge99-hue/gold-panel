/**
 * Concierge Resources — pay-per-use creative endpoints (MVP Tier 2).
 */
import { buildImagePrompt, detectTopics } from "./concierge-brain";
import {
  EDGE_HANDLER_BUDGET_MS,
  normalizeGeminiApiKey,
  runConciergeGemini,
  type ChatTurn,
} from "./concierge-gemini";
import { MVP_RESOURCE_PATHS } from "./concierge-resources-catalog";
import { runResourceScaffold } from "./concierge-resource-scaffold";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import { reportPaidRouteToZauth } from "./zauth-paid-response";
import { guardPaidX402Api } from "./x402-server";
import type { X402MvpResourceKind } from "./x402-pricing";

export type { X402MvpResourceKind };

const MVP_KINDS = Object.keys(MVP_RESOURCE_PATHS) as X402MvpResourceKind[];

function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function parseMessageBody(raw: unknown): { message: string; history: ChatTurn[] } {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4_000) {
    throw new Error("message is required (max 4000 chars)");
  }
  const history: ChatTurn[] = [];
  if (Array.isArray(body.history)) {
    for (const row of body.history.slice(-8)) {
      if (!row || typeof row !== "object") continue;
      const role = (row as { role?: string }).role;
      const text = (row as { text?: string }).text;
      if ((role === "user" || role === "model") && typeof text === "string" && text.trim()) {
        history.push({ role, text: text.slice(0, 8_000) });
      }
    }
  }
  return { message, history };
}

export function resolveMvpResourceKindFromRequest(request: Request): X402MvpResourceKind | null {
  const path = new URL(request.url).pathname;
  for (const kind of MVP_KINDS) {
    if (path === MVP_RESOURCE_PATHS[kind]) return kind;
  }
  return null;
}

async function geminiGenerateImageResource(apiKey: string, prompt: string): Promise<string[]> {
  const topics = detectTopics(prompt);
  const imagePrompt = buildImagePrompt(prompt, topics);
  const models = [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-2.0-flash-preview-image-generation",
  ];
  const errors: string[] = [];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
        signal: AbortSignal.timeout(22_000),
      });
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const images = parts
        .filter((p) => p.inlineData?.data)
        .map((p) => `data:${p.inlineData!.mimeType};base64,${p.inlineData!.data}`);
      if (images.length) return images;
      errors.push(`${model}: no image`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.length ? errors.join("; ") : "Image generation failed");
}

export async function handleConciergeResourceRoute(
  request: Request,
  kind: X402MvpResourceKind,
): Promise<Response> {
  const requestStartedAt = Date.now();
  const routed = await guardPaidX402Api(request, kind);
  if ("response" in routed) return routed.response;
  const { gate: payGate } = routed.continue;
  const startedAt = Date.now();

  try {
    assertAllowedOrigin(request);
    const raw = await readBodyWithLimit(request);
    const { message, history } = parseMessageBody(raw);
    const apiKey = normalizeGeminiApiKey(process.env.GEMINI_API_KEY);

    if (kind === "resource-chat") {
      const result = await runConciergeGemini({
        apiKey,
        mode: "chat",
        message,
        history,
        market: [],
        deadlineAt: requestStartedAt + EDGE_HANDLER_BUDGET_MS,
      });
      const reply = "reply" in result ? result.reply : "";
      const topics = "topics" in result ? (result.topics ?? []) : [];
      const payload = {
        ok: true,
        kind,
        slug: "resource-chat",
        reply,
        topics,
      };
      const extra: Record<string, string> = {};
      if (payGate.paymentResponseHeader) extra["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
      if (payGate.payer && payGate.transaction?.startsWith("tcx-credits:")) {
        extra["X-TCX-Credits-Spent"] = payGate.transaction.replace("tcx-credits:", "");
      }
      reportPaidRouteToZauth(request, kind, 200, payload, startedAt, {
        payer: payGate.payer,
        transaction: payGate.transaction,
        paymentResponseHeader: payGate.paymentResponseHeader,
      });
      return jsonResponse(request, payload, 200, extra);
    }

    if (kind === "resource-image") {
      const images = await geminiGenerateImageResource(apiKey, message);
      const payload = {
        ok: true,
        kind,
        slug: "resource-image",
        prompt: message,
        images,
        count: images.length,
      };
      const extra: Record<string, string> = {};
      if (payGate.paymentResponseHeader) extra["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
      reportPaidRouteToZauth(request, kind, 200, payload, startedAt, {
        payer: payGate.payer,
        transaction: payGate.transaction,
        paymentResponseHeader: payGate.paymentResponseHeader,
      });
      return jsonResponse(request, payload, 200, extra);
    }

    const scaffold = await runResourceScaffold(message);
    const payload = {
      ok: true,
      kind,
      slug: scaffold.slug,
      title: scaffold.title,
      html: scaffold.html,
    };
    const extra: Record<string, string> = {};
    if (payGate.paymentResponseHeader) extra["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
    reportPaidRouteToZauth(request, kind, 200, payload, startedAt, {
      payer: payGate.payer,
      transaction: payGate.transaction,
      paymentResponseHeader: payGate.paymentResponseHeader,
    });
    return jsonResponse(request, payload, 200, extra);
  } catch (e) {
    console.error(`[resource/${kind}]`, e instanceof Error ? e.message : e);
    return jsonResponse(
      request,
      { error: sanitizePublicError(e), code: "resource_failed", kind },
      500,
    );
  }
}
