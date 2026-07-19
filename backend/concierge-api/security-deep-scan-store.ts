/**
 * Concierge Deep Scan job store — KV / Upstash with in-memory fallback for local dev.
 */
export type DeepScanJobStatus = "queued" | "running" | "completed" | "failed";

export type DeepScanProgress = {
  phase?: string;
  percent?: number;
  message?: string;
};

export type DeepScanJobRecord = {
  jobId: string;
  status: DeepScanJobStatus;
  target: { origin: string; hostname: string };
  allowlist: string[];
  profile: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  payer?: string | null;
  progress?: DeepScanProgress | null;
  error?: string | null;
  /** Normalized Concierge payload when completed */
  result?: Record<string, unknown> | null;
  /** Raw worker payload (kept server-side; stripped from public GET unless needed) */
  raw?: unknown;
};

const KEY_PREFIX = "concierge:security-deep-scan:";
const DEFAULT_TTL_SEC = 3600;
const MAX_MEM = 200;
const memJobs = new Map<string, DeepScanJobRecord>();

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function jobKey(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`;
}

export function deepScanJobTtlSec(): number {
  const raw = Number(process.env.SECURITY_DEEP_SCAN_JOB_TTL_SEC ?? DEFAULT_TTL_SEC);
  if (!Number.isFinite(raw) || raw < 300) return DEFAULT_TTL_SEC;
  return Math.min(Math.floor(raw), 86_400);
}

export function generateDeepScanJobId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `ds_${hex}`;
}

function pruneMem(): void {
  if (memJobs.size <= MAX_MEM) return;
  const now = Date.now();
  for (const [id, job] of memJobs) {
    if (Date.parse(job.expiresAt) < now) memJobs.delete(id);
  }
  while (memJobs.size > MAX_MEM) {
    const first = memJobs.keys().next().value;
    if (first == null) break;
    memJobs.delete(first);
  }
}

export async function putDeepScanJob(job: DeepScanJobRecord): Promise<void> {
  const ttl = deepScanJobTtlSec();
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(jobKey(job.jobId), job, { ex: ttl });
    return;
  }
  pruneMem();
  memJobs.set(job.jobId, job);
}

export async function getDeepScanJob(jobId: string): Promise<DeepScanJobRecord | null> {
  if (!jobId || !/^ds_[a-f0-9]{20}$/i.test(jobId)) return null;
  if (hasRedis()) {
    const kv = await kvClient();
    const row = await kv.get<DeepScanJobRecord>(jobKey(jobId));
    return row ?? null;
  }
  const job = memJobs.get(jobId) ?? null;
  if (job && Date.parse(job.expiresAt) < Date.now()) {
    memJobs.delete(jobId);
    return null;
  }
  return job;
}

export async function patchDeepScanJob(
  jobId: string,
  patch: Partial<
    Pick<DeepScanJobRecord, "status" | "progress" | "error" | "result" | "raw" | "updatedAt">
  >,
): Promise<DeepScanJobRecord | null> {
  const cur = await getDeepScanJob(jobId);
  if (!cur) return null;
  const next: DeepScanJobRecord = {
    ...cur,
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
  await putDeepScanJob(next);
  return next;
}

export function publicDeepScanView(job: DeepScanJobRecord): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ok: job.status !== "failed",
    kind: "security-deep-scan",
    status: job.status,
    jobId: job.jobId,
    target: job.target,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    profile: job.profile,
    disclaimer:
      "Concierge Deep Scan — authorized passive templates only. No exploitation. Caller accepts full responsibility.",
  };
  if (job.progress) base.progress = job.progress;
  if (job.status === "queued" || job.status === "running") {
    base.pollAfterMs = 3000;
  }
  if (job.status === "failed") {
    base.error = job.error ?? "Deep scan failed";
    base.code = "deep_scan_failed";
  }
  if (job.status === "completed" && job.result) {
    return { ...base, ...job.result, ok: true, status: "completed", jobId: job.jobId };
  }
  return base;
}
