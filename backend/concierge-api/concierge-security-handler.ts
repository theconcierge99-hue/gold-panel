/**
 * Security desk routes — passive scout audits for authorized external targets.
 */
import {
  runSecurityHeadersAudit,
  runSecurityReadinessAudit,
  runSecurityScanAudit,
  runSecurityScopeValidation,
} from "./concierge-security-audit";
import {
  PlatformScopeForbiddenError,
  SecurityTargetInvalidError,
  isSelfAuditRequest,
  securityRequireAllowlist,
} from "./concierge-security-scope";
import { SecurityTierDeniedError, assertSoonSecurityTierAccess } from "./soon-security-tier";
import {
  checkSecurityRateLimit,
  securityRateLimitHeaders,
} from "./security-rate-limit";
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import { reportPaidRouteToZauth } from "./zauth-paid-response";
import { guardPaidX402Api } from "./x402-server";
import type { X402SecurityKind } from "./x402-pricing";
import { applyScanTierFilter, resolveScanAccessTier } from "./concierge-security-breakdown";

export type { X402SecurityKind };

export const SECURITY_ROUTE_PATH: Record<X402SecurityKind, string> = {
  "security-readiness": "/api/concierge-security-readiness",
  "security-headers": "/api/concierge-security-headers",
  "security-scan": "/api/concierge-security-scan",
};

const PAID_SECURITY_KINDS = Object.keys(SECURITY_ROUTE_PATH) as X402SecurityKind[];

export type SecurityRequestBody = {
  /** Required — https origin to audit. */
  target?: string;
  /** Optional hostname allowlist (*.example.com, api.example.com). */
  allowlist?: string[];
  /** Caller attests they have authorization to probe the target. */
  authorized?: boolean;
  /** When true with conc-exe.xyz target — canonical public self-audit (free on security-scan). */
  selfAudit?: boolean;
};

export function resolveSecurityKindFromRequest(request: Request): X402SecurityKind | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("kind");
  if (fromQuery && PAID_SECURITY_KINDS.includes(fromQuery as X402SecurityKind)) {
    return fromQuery as X402SecurityKind;
  }
  const match = url.pathname.match(/^\/api\/concierge-security-([a-z][a-z0-9-]*)$/);
  if (!match) return null;
  const kind = `security-${match[1]}` as X402SecurityKind;
  return PAID_SECURITY_KINDS.includes(kind) ? kind : null;
}

export function isSecurityScopeRoute(request: Request): boolean {
  return new URL(request.url).pathname === "/api/concierge-security-scope";
}

function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

export function validateSecurityRequest(raw: unknown): SecurityRequestBody {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new SecurityTargetInvalidError("invalid_body", "Invalid JSON body");
  }
  return raw as SecurityRequestBody;
}

function securityErrorStatus(e: unknown): number {
  if (e instanceof PlatformScopeForbiddenError) return 403;
  if (e instanceof SecurityTierDeniedError) return 403;
  if (e instanceof SecurityTargetInvalidError) {
    if (e.code === "invalid_body") return 400;
    return 400;
  }
  const msg = sanitizePublicError(e);
  if (msg.includes("too large")) return 413;
  if (msg.includes("Origin not allowed")) return 403;
  return 500;
}

function securityErrorBody(e: unknown, kind?: string) {
  if (e instanceof PlatformScopeForbiddenError) {
    return {
      error: "Platform scope forbidden - Concierge infrastructure cannot be probed",
      code: e.code,
      kind,
    };
  }
  if (e instanceof SecurityTargetInvalidError) {
    return { error: e.message, code: e.code, kind };
  }
  if (e instanceof SecurityTierDeniedError) {
    return { error: e.message, code: e.code, kind };
  }
  return { error: sanitizePublicError(e), kind };
}

function rateLimitedSecurityResponse(
  request: Request,
  state: import("./security-rate-limit").SecurityRateLimitState,
  route: "security-scope" | "security-audit",
) {
  return jsonResponse(
    request,
    { error: "Rate limit exceeded", code: "rate_limit_exceeded" },
    429,
    securityRateLimitHeaders(state, route),
  );
}

async function assertSecurityTierAccess(
  request: Request,
  routeKind: string,
  paidViaX402: boolean,
): Promise<void> {
  if (paidViaX402) return;
  if (process.env.SECURITY_ENFORCE_SOON_TIER === "true") {
    await assertSoonSecurityTierAccess(request, routeKind as "security-readiness");
  }
}

/** Free scope validation — no outbound fetch, no x402. */
export async function handleSecurityScopeRoute(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed", code: "method_not_allowed" }, 405);
  }

  try {
    assertAllowedOrigin(request);

    const rate = checkSecurityRateLimit(request, "security-scope");
    if (!rate.allowed) return rateLimitedSecurityResponse(request, rate, "security-scope");

    const raw = await readBodyWithLimit(request);
    const body = validateSecurityRequest(raw);

    if (!body.target?.trim()) {
      return jsonResponse(
        request,
        { error: "target is required", code: "target_required", kind: "security-scope" },
        400,
      );
    }

    const payload = runSecurityScopeValidation(body.target, body.allowlist, request, {
      requireEntries: false,
      selfAudit: body.selfAudit === true,
    });
    return jsonResponse(request, payload, payload.ok ? 200 : 400, securityRateLimitHeaders(rate, "security-scope"));
  } catch (e) {
    const status = securityErrorStatus(e);
    return jsonResponse(request, securityErrorBody(e, "security-scope"), status);
  }
}

export async function handleConciergeSecurityRoute(
  request: Request,
  kind: X402SecurityKind,
): Promise<Response> {
  const startedAt = Date.now();
  let preBody: SecurityRequestBody | null = null;

  if (request.method === "POST") {
    try {
      const raw = await readBodyWithLimit(request);
      preBody = validateSecurityRequest(raw);
    } catch {
      preBody = null;
    }
  }

  const selfAuditFree =
    kind === "security-scan" && preBody != null && isSelfAuditRequest(preBody);

  let payGate: {
    payer?: string;
    transaction?: string;
    paymentResponseHeader?: string | null;
  } = { payer: "self-audit", transaction: "platform-self-audit" };

  if (!selfAuditFree) {
    const routed = await guardPaidX402Api(request, kind);
    if ("response" in routed) return routed.response;
    payGate = routed.continue.gate;
  }

  try {
    assertAllowedOrigin(request);

    const rate = checkSecurityRateLimit(request, "security-audit");
    if (!rate.allowed) return rateLimitedSecurityResponse(request, rate, "security-audit");

    const settlementOk =
      selfAuditFree ||
      payGate.payer === "dev-bypass" ||
      payGate.transaction === "soon-holder-free-tier" ||
      Boolean(payGate.transaction && payGate.payer && payGate.payer !== "dev-bypass");
    await assertSecurityTierAccess(request, kind, settlementOk);

    const body = preBody ?? validateSecurityRequest(await readBodyWithLimit(request));

    if (!body.target?.trim()) {
      throw new SecurityTargetInvalidError("target_required", "target URL is required");
    }

    if (body.authorized !== true) {
      throw new SecurityTargetInvalidError(
        "authorization_required",
        "authorized must be true - caller attests permission to probe the target",
      );
    }

    const auditOpts = body.selfAudit === true ? { selfAudit: true as const } : undefined;

    const scope = runSecurityScopeValidation(body.target, body.allowlist, request, {
      requireEntries: securityRequireAllowlist() && !selfAuditFree,
      selfAudit: body.selfAudit === true,
    });
    if (!scope.ok) {
      return jsonResponse(request, { ...scope, error: "Target outside declared allowlist", code: "allowlist_mismatch" }, 400);
    }

    let payload: unknown;
    if (kind === "security-scan") {
      const scan = await runSecurityScanAudit(body.target, auditOpts);
      const accessTier = await resolveScanAccessTier(request, payGate.payer, {
        selfAudit: selfAuditFree,
        devBypass: payGate.payer === "dev-bypass",
      });
      payload = applyScanTierFilter(scan, accessTier);
    } else if (kind === "security-readiness") {
      payload = await runSecurityReadinessAudit(body.target, auditOpts);
    } else {
      payload = await runSecurityHeadersAudit(body.target, auditOpts);
    }

    const extraHeaders: Record<string, string> = {};
    if (payGate.paymentResponseHeader) {
      extraHeaders["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
    }

    if (!selfAuditFree) {
      reportPaidRouteToZauth(request, kind, 200, payload, startedAt, {
        payer: payGate.payer,
        transaction: payGate.transaction,
        paymentResponseHeader: payGate.paymentResponseHeader,
      });
    }

    return jsonResponse(request, payload, 200, {
      ...extraHeaders,
      ...securityRateLimitHeaders(rate, "security-audit"),
    });
  } catch (e) {
    const status = securityErrorStatus(e);
    return jsonResponse(request, securityErrorBody(e, kind), status);
  }
}
