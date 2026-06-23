/**
 * Stricter rate limits for security desk routes (abuse / SSRF probe protection).
 */

export const SECURITY_RATE_LIMIT = {
  scopePerMinute: 20,
  auditPerMinute: 8,
  windowSeconds: 60,
} as const;

export type SecurityRateLimitState = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 4_000;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function prune(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;
  const overflow = buckets.size - MAX_BUCKETS;
  for (const key of [...buckets.keys()].slice(0, overflow)) buckets.delete(key);
}

export function checkSecurityRateLimit(
  request: Request,
  route: "security-scope" | "security-audit",
): SecurityRateLimitState {
  if (request.method === "OPTIONS") {
    return {
      allowed: true,
      remaining: SECURITY_RATE_LIMIT.scopePerMinute,
      retryAfter: SECURITY_RATE_LIMIT.windowSeconds,
    };
  }

  const limit =
    route === "security-scope"
      ? SECURITY_RATE_LIMIT.scopePerMinute
      : SECURITY_RATE_LIMIT.auditPerMinute;

  const ip = clientIp(request);
  const key = `${route}:${ip}`;
  const now = Date.now();
  const windowMs = SECURITY_RATE_LIMIT.windowSeconds * 1000;

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  prune();

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - bucket.count);
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }
  return { allowed: true, remaining, retryAfter };
}

export function securityRateLimitHeaders(
  state: SecurityRateLimitState,
  route: "security-scope" | "security-audit",
): Record<string, string> {
  const limit =
    route === "security-scope"
      ? SECURITY_RATE_LIMIT.scopePerMinute
      : SECURITY_RATE_LIMIT.auditPerMinute;
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(state.remaining),
    "Retry-After": String(state.retryAfter),
    "X-Security-Desk": "passive-only",
  };
}
