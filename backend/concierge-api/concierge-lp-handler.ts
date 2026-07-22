/**
 * Concierge LP — session Start/Stop/Status/Withdraw.
 * Paths: /api/concierge-lp/start|stop|status|withdraw-intent
 */
import { corsHeadersFor, readBodyWithLimit, sanitizePublicError } from "./concierge-security";
import { buildLpStartMessage, buildLpStopMessage, verifyLpWalletSignature } from "./concierge-lp-auth";
import {
  defaultLpCriteria,
  generateLpSessionId,
  getActiveSessionIdForWallet,
  getLpSession,
  lpSessionTtlSec,
  patchLpSession,
  publicLpSessionView,
  putLpSession,
  type ConciergeLpSessionRecord,
} from "./concierge-lp-store";
import { guardPaidX402Api } from "./x402-server";
import { reportPaidRouteToZauth } from "./zauth-paid-response";
import { normalizeSolPayTo } from "./x402-address";
import bs58 from "bs58";

const KIND = "concierge-lp" as const;
const BASE = "/api/concierge-lp";

export function isConciergeLpRoute(request: Request): boolean {
  const p = new URL(request.url).pathname;
  return (
    p === `${BASE}/start` ||
    p === `${BASE}/stop` ||
    p === `${BASE}/status` ||
    p === `${BASE}/withdraw-intent` ||
    p === BASE
  );
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
  return (process.env.CONCIERGE_LP_WORKER_URL ?? "").trim().replace(/\/$/, "");
}

function workerSecret(): string {
  return (process.env.CONCIERGE_LP_WORKER_SECRET ?? "").trim().replace(/\r/g, "");
}

function allowStubWithoutWorker(): boolean {
  return process.env.CONCIERGE_LP_ALLOW_STUB === "true" || process.env.VERCEL_ENV !== "production";
}

function workerHeaders(): Record<string, string> {
  const secret = workerSecret();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
  };
}

async function workerStart(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  view?: Record<string, unknown>;
  error?: string;
}> {
  const base = workerUrl();
  if (!base) return { ok: false, error: "worker_url_unset" };
  try {
    const res = await fetch(`${base}/session/start`, {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: String(data.error || `worker_http_${res.status}`) };
    }
    return { ok: true, view: data };
  } catch (e) {
    return { ok: false, error: sanitizePublicError(e) };
  }
}

async function workerStop(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  view?: Record<string, unknown>;
  error?: string;
}> {
  const base = workerUrl();
  if (!base) return { ok: false, error: "worker_url_unset" };
  try {
    const res = await fetch(`${base}/session/stop`, {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: String(data.error || `worker_http_${res.status}`) };
    }
    return { ok: true, view: data };
  } catch (e) {
    return { ok: false, error: sanitizePublicError(e) };
  }
}

async function workerStatus(sessionId: string): Promise<Record<string, unknown> | null> {
  const base = workerUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/session/status?sessionId=${encodeURIComponent(sessionId)}`, {
      headers: workerHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Edge-safe stub pubkey (no @solana/web3.js). */
function stubDepositAddress(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bs58.encode(bytes);
}

function stubStartView(sessionId: string, ownerWallet: string, dryRun: boolean, criteria: object) {
  const deposit = stubDepositAddress();
  return {
    sessionId,
    ownerWallet,
    sessionPubkey: deposit,
    depositAddress: deposit,
    dryRun,
    status: "active",
    criteria,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    decisions: [
      {
        agent: "hunter",
        action: "STAY",
        reason: "stub_worker",
        at: new Date().toISOString(),
        mode: "paper",
      },
    ],
    lessons: [],
    positions: [],
    lastScreen: {
      at: new Date().toISOString(),
      candidateCount: 0,
      intelSource: "stub",
      top: [],
    },
    lastError: null,
    _stub: true,
  };
}

type StartBody = {
  wallet?: string;
  message?: string;
  signature?: string;
  nonce?: string;
  exp?: number;
  dryRun?: boolean;
  criteria?: unknown;
};

type StopBody = {
  wallet?: string;
  sessionId?: string;
  message?: string;
  signature?: string;
  nonce?: string;
  exp?: number;
  closePositions?: boolean;
  withdraw?: boolean;
};

async function handleStart(request: Request): Promise<Response> {
  let body: StartBody;
  try {
    body = (await readBodyWithLimit(request)) as StartBody;
  } catch (e) {
    return jsonResponse(request, { error: sanitizePublicError(e), kind: KIND }, 400);
  }

  const wallet = String(body.wallet || "").trim();
  const message = String(body.message || "").trim();
  const signature = String(body.signature || "").trim();
  if (!wallet || !message || !signature) {
    return jsonResponse(
      request,
      { error: "wallet, message, and signature required", code: "auth_required", kind: KIND },
      400,
    );
  }

  if (!normalizeSolPayTo(wallet)) {
    return jsonResponse(request, { error: "Invalid Solana wallet", code: "invalid_wallet", kind: KIND }, 400);
  }

  if (body.nonce != null && body.exp != null) {
    const expectedMsg = buildLpStartMessage(wallet, String(body.nonce), Number(body.exp));
    if (message !== expectedMsg) {
      return jsonResponse(request, { error: "Message mismatch", code: "message_mismatch", kind: KIND }, 400);
    }
  }

  const verified = await verifyLpWalletSignature({ wallet, message, signature });
  if (!verified.ok) {
    return jsonResponse(request, { error: verified.error, code: "auth_failed", kind: KIND }, 401);
  }

  const existingId = await getActiveSessionIdForWallet(wallet);
  if (existingId) {
    const existing = await getLpSession(existingId);
    if (existing) {
      const w = await workerStatus(existingId);
      return jsonResponse(request, publicLpSessionView(existing, w), 200);
    }
  }

  const sessionId = generateLpSessionId();
  const criteria = defaultLpCriteria(body.criteria);
  const dryRun = body.dryRun === false ? false : true;
  const now = new Date();
  const ttl = lpSessionTtlSec();

  let depositAddress = "";
  let workerView: Record<string, unknown> | null = null;

  const started = await workerStart({
    sessionId,
    ownerWallet: wallet,
    criteria,
    dryRun,
  });

  if (started.ok && started.view) {
    workerView = started.view;
    depositAddress = String(started.view.depositAddress || started.view.sessionPubkey || "");
  } else if (allowStubWithoutWorker()) {
    workerView = stubStartView(sessionId, wallet, dryRun, criteria);
    depositAddress = String(workerView.depositAddress);
  } else {
    return jsonResponse(
      request,
      {
        error: "Concierge LP worker unavailable",
        code: "worker_unavailable",
        detail: started.error,
        kind: KIND,
      },
      503,
    );
  }

  const row: ConciergeLpSessionRecord = {
    sessionId,
    ownerWallet: wallet,
    depositAddress,
    status: "active",
    dryRun,
    criteria,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    stoppedAt: null,
    lastWorkerView: workerView,
    error: null,
  };
  await putLpSession(row);

  return jsonResponse(request, publicLpSessionView(row, workerView), 201);
}

async function handleStop(request: Request): Promise<Response> {
  let body: StopBody;
  try {
    body = (await readBodyWithLimit(request)) as StopBody;
  } catch (e) {
    return jsonResponse(request, { error: sanitizePublicError(e), kind: KIND }, 400);
  }

  const wallet = String(body.wallet || "").trim();
  const sessionId = String(body.sessionId || "").trim();
  const message = String(body.message || "").trim();
  const signature = String(body.signature || "").trim();
  if (!wallet || !sessionId || !message || !signature) {
    return jsonResponse(
      request,
      { error: "wallet, sessionId, message, and signature required", code: "auth_required", kind: KIND },
      400,
    );
  }

  if (body.nonce != null && body.exp != null) {
    const expectedMsg = buildLpStopMessage(wallet, sessionId, String(body.nonce), Number(body.exp));
    if (message !== expectedMsg) {
      return jsonResponse(request, { error: "Message mismatch", code: "message_mismatch", kind: KIND }, 400);
    }
  }

  const verified = await verifyLpWalletSignature({ wallet, message, signature });
  if (!verified.ok) {
    return jsonResponse(request, { error: verified.error, code: "auth_failed", kind: KIND }, 401);
  }

  const row = await getLpSession(sessionId);
  if (!row) {
    return jsonResponse(request, { error: "Session not found", code: "not_found", kind: KIND }, 404);
  }
  if (row.ownerWallet !== wallet) {
    return jsonResponse(request, { error: "Wallet does not own session", code: "forbidden", kind: KIND }, 403);
  }

  await patchLpSession(sessionId, { status: "stopping" });

  let workerView: Record<string, unknown> | null = null;
  const stopped = await workerStop({
    sessionId,
    closePositions: body.closePositions !== false,
    withdraw: body.withdraw !== false,
  });
  if (stopped.ok && stopped.view) {
    workerView = stopped.view;
  } else if (row.lastWorkerView) {
    workerView = {
      ...row.lastWorkerView,
      status: "stopped",
      stoppedAt: new Date().toISOString(),
      withdraw: { ok: true, dryRun: row.dryRun, note: "stub_or_worker_miss" },
    };
  }

  const next = await patchLpSession(sessionId, {
    status: "stopped",
    stoppedAt: new Date().toISOString(),
    lastWorkerView: workerView,
    error: stopped.ok ? null : stopped.error || null,
  });

  return jsonResponse(request, publicLpSessionView(next!, workerView), 200);
}

async function handleStatus(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  const wallet = (url.searchParams.get("wallet") || "").trim();

  if (!sessionId && wallet) {
    const active = await getActiveSessionIdForWallet(wallet);
    if (!active) {
      return jsonResponse(request, { session: null, kind: KIND }, 200);
    }
    const row = await getLpSession(active);
    if (!row) return jsonResponse(request, { session: null, kind: KIND }, 200);
    const w = await workerStatus(active);
    if (w) await patchLpSession(active, { lastWorkerView: w });
    return jsonResponse(request, { session: publicLpSessionView(row, w), kind: KIND }, 200);
  }

  if (!sessionId) {
    return jsonResponse(request, { error: "sessionId or wallet required", kind: KIND }, 400);
  }

  const row = await getLpSession(sessionId);
  if (!row) {
    return jsonResponse(request, { error: "Session not found", code: "not_found", kind: KIND }, 404);
  }
  const w = row.status === "active" ? await workerStatus(sessionId) : row.lastWorkerView;
  if (w && row.status === "active") await patchLpSession(sessionId, { lastWorkerView: w });
  return jsonResponse(request, publicLpSessionView(row, w), 200);
}

async function handleWithdrawIntent(request: Request): Promise<Response> {
  let body: { sessionId?: string; wallet?: string };
  try {
    body = (await readBodyWithLimit(request)) as { sessionId?: string; wallet?: string };
  } catch (e) {
    return jsonResponse(request, { error: sanitizePublicError(e), kind: KIND }, 400);
  }
  const sessionId = String(body.sessionId || "").trim();
  const wallet = String(body.wallet || "").trim();
  const row = await getLpSession(sessionId);
  if (!row) {
    return jsonResponse(request, { error: "Session not found", kind: KIND }, 404);
  }
  if (wallet && row.ownerWallet !== wallet) {
    return jsonResponse(request, { error: "forbidden", kind: KIND }, 403);
  }
  return jsonResponse(
    request,
    {
      sessionId: row.sessionId,
      depositAddress: row.depositAddress,
      ownerWallet: row.ownerWallet,
      status: row.status,
      instruction:
        row.status === "stopped"
          ? "Session stopped — remaining SOL was returned to owner when withdraw succeeded."
          : "Stop the session to close positions and withdraw remaining SOL to your wallet.",
      kind: KIND,
    },
    200,
  );
}

export async function handleConciergeLpRoute(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  }

  const path = new URL(request.url).pathname;

  if (path === `${BASE}/status` || (path === BASE && request.method === "GET")) {
    return handleStatus(request);
  }
  if (path === `${BASE}/withdraw-intent` && request.method === "POST") {
    return handleWithdrawIntent(request);
  }
  if (path === `${BASE}/stop` && request.method === "POST") {
    return handleStop(request);
  }
  if (path === `${BASE}/start` && request.method === "POST") {
    const startedAt = Date.now();
    const routed = await guardPaidX402Api(request, KIND);
    if ("response" in routed) return routed.response;
    const payGate = routed.continue.gate;
    const res = await handleStart(request);
    if (res.ok || res.status === 201) {
      try {
        const clone = res.clone();
        const body = await clone.json().catch(() => ({}));
        reportPaidRouteToZauth(request, KIND, res.status, body, startedAt, {
          payer: payGate.payer,
          transaction: payGate.transaction,
          paymentResponseHeader: payGate.paymentResponseHeader,
        });
      } catch {
        /* */
      }
    }
    return res;
  }

  return jsonResponse(request, { error: "Not found", kind: KIND }, 404);
}
