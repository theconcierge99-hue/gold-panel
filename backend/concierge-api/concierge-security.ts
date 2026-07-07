import type { ChatTurn, ConciergeMode } from "./concierge-gemini";
import type { MarketTick } from "./concierge-brain";
import type { ConciergeAgentModelId } from "./concierge-llm-models";
import { parseConciergeAgentModel } from "./concierge-llm-models";
import { parseClientLiveSnapshot, type LiveMarketSnapshot } from "./market-data";

/** Vercel Hobby–safe limits (cost + abuse protection) */
export const LIMITS = {
  maxBodyBytes: 48_000,
  maxMessageChars: 4_000,
  maxHistoryTurns: 12,
  maxTurnChars: 8_000,
  maxMarketTicks: 12,
  maxSignalFieldChars: 2_000,
} as const;

export type ConciergeRequest = {
  mode: ConciergeMode;
  message: string;
  history: ChatTurn[];
  signal?: { title?: string; summary?: string };
  market: MarketTick[];
  liveSnapshot?: LiveMarketSnapshot | null;
  agentModel: ConciergeAgentModelId;
};

export function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function getAllowedOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
  ]);

  const extra = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) ?? [];
  for (const o of extra) {
    if (o) origins.add(o);
  }

  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) origins.add(`https://${vercelHost}`);

  const branch = process.env.VERCEL_BRANCH_URL;
  if (branch) origins.add(`https://${branch}`);

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) origins.add(`https://${prod}`);

  return [...origins];
}

function requestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/** Custom domain on Vercel: allow when Origin host matches request Host (same site). */
function originMatchesRequestHost(request: Request, origin: string): boolean {
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isOriginAllowed(request: Request): boolean {
  const origin = requestOrigin(request);
  if (!origin) {
    if (!isProduction()) return true;
    // Same-origin GET fetch() omits Origin; Sec-Fetch-Site / Referer still identify the page.
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite === "same-origin" || fetchSite === "same-site") return true;
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (getAllowedOrigins().includes(refOrigin) || originMatchesRequestHost(request, refOrigin)) {
          return true;
        }
      } catch {
        /* ignore malformed referer */
      }
    }
    return false;
  }

  if (getAllowedOrigins().includes(origin)) return true;
  return originMatchesRequestHost(request, origin);
}

export function assertAllowedOrigin(request: Request): void {
  if (!requestOrigin(request)) {
    // Server-side x402 / agent clients omit Origin (curl, pay, MCP, PowerShell).
    const method = request.method;
    if (method === "GET" || method === "HEAD" || method === "POST") return;
  }
  if (!isOriginAllowed(request)) {
    throw new Error("Origin not allowed");
  }
}

function clampText(value: string, max: number): string {
  return value.slice(0, max).replace(/\0/g, "");
}

export function validateConciergeRequest(raw: unknown): ConciergeRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid request body");
  }

  const body = raw as Record<string, unknown>;
  const mode =
    body.mode === "enhance" ? "enhance" : body.mode === "image" ? "image" : "chat";

  const message = clampText(String(body.message ?? ""), LIMITS.maxMessageChars).trim();
  if (!message) throw new Error("message is required");

  const history: ChatTurn[] = [];
  if (Array.isArray(body.history)) {
    for (const turn of body.history.slice(-LIMITS.maxHistoryTurns)) {
      if (!turn || typeof turn !== "object") continue;
      const t = turn as Record<string, unknown>;
      const role = t.role === "model" ? "model" : "user";
      const text = clampText(String(t.text ?? ""), LIMITS.maxTurnChars).trim();
      if (text) history.push({ role, text });
    }
  }

  let signal: ConciergeRequest["signal"];
  if (body.signal && typeof body.signal === "object") {
    const s = body.signal as Record<string, unknown>;
    signal = {
      title: clampText(String(s.title ?? ""), LIMITS.maxSignalFieldChars),
      summary: clampText(String(s.summary ?? ""), LIMITS.maxSignalFieldChars),
    };
  }

  const market: MarketTick[] = [];
  if (Array.isArray(body.market)) {
    for (const row of body.market.slice(0, LIMITS.maxMarketTicks)) {
      if (!row || typeof row !== "object") continue;
      const m = row as Record<string, unknown>;
      const symbol = clampText(String(m.symbol ?? ""), 16).trim();
      if (!symbol) continue;
      market.push({
        symbol,
        price: clampText(String(m.price ?? ""), 32),
        change: clampText(String(m.change ?? ""), 16),
      });
    }
  }

  const liveSnapshot = parseClientLiveSnapshot(body.liveSnapshot);

  return {
    mode,
    message,
    history,
    signal,
    market,
    liveSnapshot,
    agentModel: parseConciergeAgentModel(body.agentModel),
  };
}

export async function readBodyWithLimit(request: Request): Promise<unknown> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > LIMITS.maxBodyBytes) {
    throw new Error("Request body too large");
  }

  const text = await request.text();
  if (text.length > LIMITS.maxBodyBytes) {
    throw new Error("Request body too large");
  }
  if (!text.trim()) throw new Error("Empty request body");

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = requestOrigin(request);
  const allowed = getAllowedOrigins();
  let allowOrigin = allowed[0] ?? "*";
  if (origin && isOriginAllowed(request)) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Agent-Id, Idempotency-Key, payment-signature, PAYMENT-SIGNATURE, PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Soon-Holder-Wallet, X-OOBE-SETTLEMENT-TX, X-PAYMENT-SETTLEMENT, X-PAYMENT-AMOUNT, X-PAYMENT-SIG, X-PAYMENT-ESCROW",
    "Access-Control-Expose-Headers":
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Policy, RateLimit-Limit, RateLimit-Remaining, Retry-After, Link, Signature-Agent",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function sanitizePublicError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "Unknown error";

  if (!isProduction()) return msg;

  if (
    msg.includes("GEMINI_API_KEY") ||
    msg.includes("GLM_API_KEY") ||
    msg.includes("ZAI_API_KEY") ||
    msg.includes("API key") ||
    msg.includes("API_KEY")
  ) {
    return "Concierge is not configured. Contact the site operator.";
  }
  if (
    msg.includes("Origin not allowed") ||
    msg.includes("too large") ||
    msg.includes("required") ||
    msg.includes("Invalid JSON") ||
    msg.includes("Invalid request")
  ) {
    return msg;
  }
  if (/\bGemini\b/.test(msg) && !msg.includes("GEMINI_API_KEY")) {
    return "Concierge is temporarily unavailable. Please try again shortly.";
  }
  if (msg.includes("Concierge timed out")) {
    return msg;
  }
  if (msg.includes("Payment") || msg.includes("x402") || msg.includes("Facilitator")) {
    return msg;
  }
  return "Concierge could not process this request. Try a shorter question.";
}

export function sanitizeNewsOpenError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "Unknown error";
  if (!isProduction()) return msg;
  if (
    msg.includes("Origin not allowed") ||
    msg.includes("too large") ||
    msg.includes("required") ||
    msg.includes("Invalid JSON") ||
    msg.includes("Invalid request") ||
    msg.includes("Valid article")
  ) {
    return msg;
  }
  if (msg.includes("Payment") || msg.includes("x402") || msg.includes("Facilitator")) {
    return msg;
  }
  return "Could not open this article. Try again shortly.";
}
