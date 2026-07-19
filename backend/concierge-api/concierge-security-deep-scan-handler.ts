/**
 * Concierge Deep Scan — async paid job (x402 $1) + worker callback.
 * Paths: POST/GET /api/concierge-security-deep-scan · POST …/complete
 */
import {
  assertAllowedOrigin,
  corsHeadersFor,
  readBodyWithLimit,
  sanitizePublicError,
} from "./concierge-security";
import {
  PlatformScopeForbiddenError,
  SecurityTargetInvalidError,
  securityRequireAllowlist,
} from "./concierge-security-scope";
import { runSecurityScopeValidation } from "./concierge-security-audit";
import {
  SECURITY_DESK_LEGAL_NOTICE,
  buildDeskModuleCatalog,
  buildDeskPhaseGroups,
  resolveLiveCeiling,
  resolveScanAccessTier,
} from "./concierge-security-breakdown";
import {
  checkSecurityRateLimit,
  securityRateLimitHeaders,
} from "./security-rate-limit";
import { guardPaidX402Api } from "./x402-server";
import { reportPaidRouteToZauth } from "./zauth-paid-response";
import {
  deepScanJobTtlSec,
  generateDeepScanJobId,
  getDeepScanJob,
  patchDeepScanJob,
  publicDeepScanView,
  putDeepScanJob,
  type DeepScanJobRecord,
} from "./security-deep-scan-store";
import { normalizeDeepScanRaw, stubDeepScanResult } from "./security-deep-scan-normalize";

const KIND = "security-deep-scan" as const;
const COMPLETE_PATH = "/api/concierge-security-deep-scan/complete";
const CREATE_PATH = "/api/concierge-security-deep-scan";

export function isDeepScanRoute(request: Request): boolean {
  const p = new URL(request.url).pathname;
  return p === CREATE_PATH || p === COMPLETE_PATH;
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

function workerUrl(): string {
  return (process.env.SECURITY_DEEP_SCAN_WORKER_URL ?? "").trim().replace(/\/$/, "");
}

function workerSecret(): string {
  return (process.env.SECURITY_DEEP_SCAN_WORKER_SECRET ?? "").trim().replace(/\r/g, "");
}

function allowStubWithoutWorker(): boolean {
  return process.env.SECURITY_DEEP_SCAN_ALLOW_STUB === "true" || process.env.VERCEL_ENV !== "production";
}

function securityErrorStatus(e: unknown): number {
  if (e instanceof PlatformScopeForbiddenError) return 403;
  if (e instanceof SecurityTargetInvalidError) {
    return 400;
  }
  const msg = sanitizePublicError(e);
  if (msg.includes("too large")) return 413;
  if (msg.includes("Origin not allowed")) return 403;
  return 500;
}

function securityErrorBody(e: unknown) {
  if (e instanceof PlatformScopeForbiddenError) {
    return {
      error: "Platform scope forbidden - Concierge infrastructure cannot be probed",
      code: e.code,
      kind: KIND,
    };
  }
  if (e instanceof SecurityTargetInvalidError) {
    return { error: e.message, code: e.code, kind: KIND };
  }
  return { error: sanitizePublicError(e), kind: KIND };
}

type CreateBody = {
  target?: string;
  allowlist?: string[];
  authorized?: boolean;
  profile?: string;
};

function parseCreateBody(raw: unknown): CreateBody {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new SecurityTargetInvalidError("invalid_body", "Invalid JSON body");
  }
  return raw as CreateBody;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function enqueueWorker(job: DeepScanJobRecord, completeUrl: string): Promise<{ ok: boolean; error?: string }> {
  const base = workerUrl();
  if (!base) return { ok: false, error: "worker_url_unset" };

  const secret = workerSecret();
  try {
    const res = await fetch(`${base}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        jobId: job.jobId,
        target: job.target.origin,
        hostname: job.target.hostname,
        allowlist: job.allowlist,
        profile: job.profile,
        completeUrl,
        secret,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `worker_http_${res.status}:${text.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: sanitizePublicError(e) };
  }
}

async function handleComplete(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed", code: "method_not_allowed" }, 405);
  }

  const expected = workerSecret();
  if (!expected) {
    return jsonResponse(request, { error: "Worker secret not configured", code: "worker_misconfigured" }, 503);
  }
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-concierge-worker-secret")?.trim() ?? "";
  const provided = bearer || headerSecret;
  if (!provided || !timingSafeEqual(provided, expected)) {
    return jsonResponse(request, { error: "Unauthorized", code: "worker_unauthorized" }, 401);
  }

  try {
    const raw = await readBodyWithLimit(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return jsonResponse(request, { error: "Invalid body", code: "invalid_body" }, 400);
    }
    const body = raw as Record<string, unknown>;
    const jobId = String(body.jobId ?? "");
    const job = await getDeepScanJob(jobId);
    if (!job) {
      return jsonResponse(request, { error: "Job not found", code: "job_not_found" }, 404);
    }
    if (job.status === "completed") {
      return jsonResponse(request, { ok: true, jobId, status: "completed" }, 200);
    }

    const status = String(body.status ?? "completed");
    if (status === "failed") {
      await patchDeepScanJob(jobId, {
        status: "failed",
        error: String(body.error ?? "Worker reported failure"),
      });
      return jsonResponse(request, { ok: true, jobId, status: "failed" }, 200);
    }

    if (status === "running") {
      await patchDeepScanJob(jobId, {
        status: "running",
        progress: (body.progress as DeepScanJobRecord["progress"]) ?? {
          phase: "scan",
          percent: Number(body.percent ?? 40),
        },
      });
      return jsonResponse(request, { ok: true, jobId, status: "running" }, 200);
    }

    const normalized = normalizeDeepScanRaw(body.raw ?? body, job.target, {
      profile: job.profile,
      auditedAt: String(body.finishedAt ?? new Date().toISOString()),
    });

    const accessTier = await resolveScanAccessTier(request, job.payer, {
      devBypass: job.payer === "dev-bypass",
    });
    const liveCeiling = resolveLiveCeiling();
    const deskModules = buildDeskModuleCatalog(accessTier, liveCeiling);
    const result = {
      ...normalized,
      access: {
        tier: accessTier,
        tierLabel: accessTier.charAt(0).toUpperCase() + accessTier.slice(1),
        liveCeiling,
        hobbyCeiling: liveCeiling,
        tcxLaunched: liveCeiling !== "guest",
        framework: "concierge-security-desk-v1",
        upgradeHint: null,
        legalNotice: SECURITY_DESK_LEGAL_NOTICE,
        moduleCounts: {
          live: deskModules.filter((m) => m.status === "live").length,
          soon: deskModules.filter((m) => m.status === "soon").length,
          locked: deskModules.filter((m) => m.status === "locked").length,
        },
      },
      deskModules,
      deskPhases: buildDeskPhaseGroups(deskModules),
    };

    await patchDeepScanJob(jobId, {
      status: "completed",
      progress: { phase: "done", percent: 100 },
      result,
      raw: body.raw ?? null,
      error: null,
    });
    return jsonResponse(request, { ok: true, jobId, status: "completed" }, 200);
  } catch (e) {
    return jsonResponse(request, securityErrorBody(e), securityErrorStatus(e));
  }
}

async function handleGet(request: Request): Promise<Response> {
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
  if (!jobId) {
    return jsonResponse(request, { error: "jobId is required", code: "job_id_required", kind: KIND }, 400);
  }
  const job = await getDeepScanJob(jobId);
  if (!job) {
    return jsonResponse(request, { error: "Job not found or expired", code: "job_not_found", kind: KIND }, 404);
  }
  if (Date.parse(job.expiresAt) < Date.now()) {
    return jsonResponse(request, { error: "Job expired", code: "job_expired", kind: KIND }, 410);
  }
  return jsonResponse(request, publicDeepScanView(job), 200);
}

async function handleCreate(request: Request): Promise<Response> {
  const startedAt = Date.now();
  let preBody: CreateBody | null = null;
  let bodyReadError: unknown = null;
  try {
    const raw = await readBodyWithLimit(request);
    preBody = parseCreateBody(raw);
  } catch (e) {
    bodyReadError = e;
    preBody = null;
  }

  const routed = await guardPaidX402Api(request, KIND);
  if ("response" in routed) return routed.response;
  const payGate = routed.continue.gate;

  try {
    assertAllowedOrigin(request);
    const rate = checkSecurityRateLimit(request, "security-audit");
    if (!rate.allowed) {
      return jsonResponse(
        request,
        { error: "Rate limit exceeded", code: "rate_limit_exceeded", kind: KIND },
        429,
        securityRateLimitHeaders(rate, "security-audit"),
      );
    }

    if (bodyReadError) throw bodyReadError;
    if (!preBody) {
      throw new SecurityTargetInvalidError("invalid_body", "Invalid JSON body");
    }
    const body = preBody;
    if (!body.target?.trim()) {
      throw new SecurityTargetInvalidError("target_required", "target URL is required");
    }
    if (body.authorized !== true) {
      throw new SecurityTargetInvalidError(
        "authorization_required",
        "authorized must be true - caller attests permission to probe the target",
      );
    }

    const scope = runSecurityScopeValidation(body.target, body.allowlist, request, {
      requireEntries: securityRequireAllowlist(),
      selfAudit: false,
    });
    if (!scope.ok) {
      return jsonResponse(
        request,
        { ...scope, error: "Target outside declared allowlist", code: "allowlist_mismatch", kind: KIND },
        400,
      );
    }

    const hasWorker = Boolean(workerUrl());
    if (!hasWorker && !allowStubWithoutWorker()) {
      return jsonResponse(
        request,
        {
          error: "Deep Scan worker is not configured",
          code: "worker_unavailable",
          kind: KIND,
        },
        503,
      );
    }

    const profile = (body.profile ?? "passive-web").trim().slice(0, 64) || "passive-web";
    const now = new Date();
    const expires = new Date(now.getTime() + deepScanJobTtlSec() * 1000);
    const jobId = generateDeepScanJobId();
    const job: DeepScanJobRecord = {
      jobId,
      status: "queued",
      target: { origin: scope.target.origin, hostname: scope.target.hostname },
      allowlist: Array.isArray(body.allowlist) ? body.allowlist.map(String).slice(0, 32) : [],
      profile,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      payer: payGate.payer ?? null,
      progress: { phase: "queued", percent: 0 },
    };
    await putDeepScanJob(job);

    const host = request.headers.get("host") || "localhost:8080";
    const proto =
      request.headers.get("x-forwarded-proto") ||
      (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
    const completeUrl =
      (process.env.SECURITY_DEEP_SCAN_COMPLETE_URL ?? "").trim() ||
      `${proto}://${host}${COMPLETE_PATH}`;

    const extraHeaders: Record<string, string> = {
      ...securityRateLimitHeaders(rate, "security-audit"),
    };
    if (payGate.paymentResponseHeader) {
      extraHeaders["PAYMENT-RESPONSE"] = payGate.paymentResponseHeader;
    }

    if (!hasWorker) {
      const stub = stubDeepScanResult(job.target, profile);
      const accessTier = await resolveScanAccessTier(request, payGate.payer, {
        devBypass: payGate.payer === "dev-bypass",
      });
      const liveCeiling = resolveLiveCeiling();
      const deskModules = buildDeskModuleCatalog(accessTier, liveCeiling);
      const result = {
        ...stub,
        access: {
          tier: accessTier,
          tierLabel: accessTier.charAt(0).toUpperCase() + accessTier.slice(1),
          liveCeiling,
          hobbyCeiling: liveCeiling,
          tcxLaunched: liveCeiling !== "guest",
          framework: "concierge-security-desk-v1",
          upgradeHint: null,
          legalNotice: SECURITY_DESK_LEGAL_NOTICE,
          moduleCounts: {
            live: deskModules.filter((m) => m.status === "live").length,
            soon: deskModules.filter((m) => m.status === "soon").length,
            locked: deskModules.filter((m) => m.status === "locked").length,
          },
        },
        deskModules,
        deskPhases: buildDeskPhaseGroups(deskModules),
      };
      await patchDeepScanJob(jobId, {
        status: "completed",
        progress: { phase: "stub", percent: 100 },
        result,
      });
      const done = await getDeepScanJob(jobId);
      reportPaidRouteToZauth(request, KIND, 202, done ? publicDeepScanView(done) : result, startedAt, {
        payer: payGate.payer,
        transaction: payGate.transaction,
        paymentResponseHeader: payGate.paymentResponseHeader,
      });
      return jsonResponse(request, done ? publicDeepScanView(done) : result, 202, extraHeaders);
    }

    const enq = await enqueueWorker(job, completeUrl);
    if (!enq.ok) {
      await patchDeepScanJob(jobId, {
        status: "failed",
        error: `Failed to enqueue worker: ${enq.error ?? "unknown"}`,
      });
      const failed = await getDeepScanJob(jobId);
      return jsonResponse(
        request,
        failed ? publicDeepScanView(failed) : { error: enq.error, code: "worker_enqueue_failed", kind: KIND },
        502,
        extraHeaders,
      );
    }

    await patchDeepScanJob(jobId, {
      status: "running",
      progress: { phase: "dispatched", percent: 5 },
    });
    const running = await getDeepScanJob(jobId);
    const view = running ? publicDeepScanView(running) : { ok: true, kind: KIND, status: "queued", jobId };
    reportPaidRouteToZauth(request, KIND, 202, view, startedAt, {
      payer: payGate.payer,
      transaction: payGate.transaction,
      paymentResponseHeader: payGate.paymentResponseHeader,
    });
    return jsonResponse(request, view, 202, extraHeaders);
  } catch (e) {
    return jsonResponse(request, securityErrorBody(e), securityErrorStatus(e));
  }
}

export async function handleDeepScanRoute(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === COMPLETE_PATH) return handleComplete(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  }
  if (request.method === "GET") return handleGet(request);
  if (request.method === "POST") return handleCreate(request);
  return jsonResponse(request, { error: "Method not allowed", code: "method_not_allowed", kind: KIND }, 405);
}
