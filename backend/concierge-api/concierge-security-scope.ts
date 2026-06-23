/**
 * Platform scope guard — blocks security probes against Concierge infrastructure.
 * Never scan conc-exe.xyz, Vercel project hosts, or private/link-local targets.
 */

export type SecurityAccessTier = "scout" | "analyst" | "principal";

/** Route → minimum SOON holder tier (Deluxe / Executive / President). */
export const SECURITY_ROUTE_TIERS: Record<string, SecurityAccessTier> = {
  "security-scope": "scout",
  "security-readiness": "scout",
  "security-headers": "scout",
};

export class PlatformScopeForbiddenError extends Error {
  readonly code = "platform_scope_forbidden" as const;

  constructor(message = "Target is within Concierge platform scope and cannot be probed") {
    super(message);
    this.name = "PlatformScopeForbiddenError";
  }
}

export class SecurityTargetInvalidError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SecurityTargetInvalidError";
    this.code = code;
  }
}

const PLATFORM_HOST_PATTERNS: RegExp[] = [
  /^conc-exe\.xyz$/i,
  /^(.+\.)?conc-exe\.xyz$/i,
  /^theconcierge99[-a-z0-9]*\.vercel\.app$/i,
  /^gold-panel[-a-z0-9]*\.vercel\.app$/i,
];

const DEFAULT_DENIED_SUFFIXES = [".internal", ".local"];

function hostFromEnvValue(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  try {
    const url = v.startsWith("http") ? new URL(v) : new URL(`https://${v}`);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return v.replace(/^https?:\/\//, "").split("/")[0]?.toLowerCase().replace(/\.$/, "") || null;
  }
}

/** Hostnames derived from deployment env — always denied as probe targets. */
export function platformDeniedHosts(): Set<string> {
  const hosts = new Set<string>(["conc-exe.xyz", "www.conc-exe.xyz"]);

  for (const key of [
    "X402_SITE_ORIGIN",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ] as const) {
    const h = hostFromEnvValue(process.env[key]);
    if (h) hosts.add(h);
  }

  const extra = process.env.ALLOWED_ORIGINS?.split(",") ?? [];
  for (const origin of extra) {
    const h = hostFromEnvValue(origin);
    if (h) hosts.add(h);
  }

  const denyExtra = process.env.SECURITY_PLATFORM_DENY_HOSTS?.split(",") ?? [];
  for (const h of denyExtra) {
    const t = h.trim().toLowerCase().replace(/\.$/, "");
    if (t) hosts.add(t);
  }

  return hosts;
}

export function securityRequireAllowlist(): boolean {
  return process.env.SECURITY_REQUIRE_ALLOWLIST !== "false";
}

function deniedSuffixes(): string[] {
  const extra = process.env.SECURITY_DENY_HOST_SUFFIXES?.split(",") ?? [];
  const merged = [...DEFAULT_DENIED_SUFFIXES];
  for (const s of extra) {
    const t = s.trim().toLowerCase();
    if (t) merged.push(t.startsWith(".") ? t : `.${t}`);
  }
  return merged;
}

function isNumericOrLiteralIp(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.startsWith("[") && h.endsWith("]")) return true;
  if (h.includes(":") && !h.startsWith("xn--")) return true;
  return false;
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;

  const v4 =
    /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(h);
  if (v4) return true;

  if (h.includes(":")) {
    const bare = h.replace(/^\[|\]$/g, "");
    if (bare === "::1" || bare.startsWith("fe80:") || bare.startsWith("fc") || bare.startsWith("fd")) {
      return true;
    }
  }

  return false;
}

function matchesPlatformPattern(hostname: string): boolean {
  return PLATFORM_HOST_PATTERNS.some((re) => re.test(hostname));
}

function matchesDeniedSuffix(hostname: string): boolean {
  const h = hostname.toLowerCase();
  for (const suffix of deniedSuffixes()) {
    const bare = suffix.startsWith(".") ? suffix.slice(1) : suffix;
    if (h === bare || h.endsWith(suffix)) return true;
  }
  return false;
}

/** Reject IDN / punycode homograph targets. */
function isPunycodeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h.startsWith("xn--") || h.split(".").some((label) => label.startsWith("xn--"));
}

export function isPlatformRelatedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const denied = platformDeniedHosts();
  return (
    denied.has(h) ||
    matchesPlatformPattern(h) ||
    matchesDeniedSuffix(h) ||
    isPrivateOrReservedHost(h) ||
    isNumericOrLiteralIp(h) ||
    isPunycodeHost(h)
  );
}

export type NormalizedSecurityTarget = {
  origin: string;
  hostname: string;
  href: string;
};

/** Parse and normalize an external probe target (https default). */
export function normalizeSecurityTarget(raw: string): NormalizedSecurityTarget {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new SecurityTargetInvalidError("target_required", "target URL is required");
  }
  if (trimmed.length > 512) {
    throw new SecurityTargetInvalidError("target_too_long", "target URL exceeds 512 characters");
  }
  if (/[\s<>\u0000]/.test(trimmed)) {
    throw new SecurityTargetInvalidError("target_invalid", "target URL contains invalid characters");
  }
  if (trimmed.includes("@")) {
    throw new SecurityTargetInvalidError("target_invalid", "target URL must not contain @");
  }

  let url: URL;
  try {
    url = trimmed.startsWith("http") ? new URL(trimmed) : new URL(`https://${trimmed}`);
  } catch {
    throw new SecurityTargetInvalidError("target_invalid", "target must be a valid http(s) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SecurityTargetInvalidError("target_scheme", "only http and https targets are allowed");
  }
  if (url.username || url.password) {
    throw new SecurityTargetInvalidError("target_credentials", "URLs with embedded credentials are not allowed");
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "443" && port !== "80") {
    throw new SecurityTargetInvalidError("target_port", "only default ports 80 and 443 are allowed");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) {
    throw new SecurityTargetInvalidError("target_invalid", "target hostname is required");
  }

  if (isPunycodeHost(hostname)) {
    throw new SecurityTargetInvalidError("target_idn", "punycode hostnames are not allowed");
  }

  if (isNumericOrLiteralIp(hostname)) {
    throw new SecurityTargetInvalidError("target_ip", "IP literal targets are not allowed - use a hostname");
  }

  url.hash = "";
  const origin = url.origin;
  const href = `${origin}/`;

  return { origin, hostname, href };
}

/** Hard reject — Concierge platform + private networks + hosting bypass vectors. */
export function assertOutOfPlatformScope(
  target: NormalizedSecurityTarget,
  request?: Request,
): void {
  if (isPlatformRelatedHost(target.hostname)) {
    throw new PlatformScopeForbiddenError();
  }

  if (request) {
    const reqHost = request.headers.get("host")?.split(":")[0]?.toLowerCase();
    if (reqHost && reqHost === target.hostname) {
      throw new PlatformScopeForbiddenError();
    }
  }
}

export type ScopeAllowlistValidation = {
  ok: boolean;
  target: NormalizedSecurityTarget;
  allowlist: string[];
  matched: boolean;
  notes: string[];
};

function sanitizeAllowlistEntry(entry: string): string | null {
  const t = entry.trim().toLowerCase().replace(/\.$/, "");
  if (!t || t.length > 253) return null;
  if (t.includes("*") && !t.startsWith("*.")) return null;
  if (isPlatformRelatedHost(t.replace(/^\*\./, ""))) return null;
  return t;
}

/** Allowlist required on paid audits — target hostname must match one entry. */
export function validateScopeAllowlist(
  target: NormalizedSecurityTarget,
  allowlist: unknown,
  options?: { requireEntries?: boolean },
): ScopeAllowlistValidation {
  const notes: string[] = [];
  const requireEntries = options?.requireEntries ?? securityRequireAllowlist();

  const entries = Array.isArray(allowlist)
    ? allowlist
        .map((e) => sanitizeAllowlistEntry(String(e)))
        .filter((e): e is string => Boolean(e))
    : [];

  if (requireEntries && !entries.length) {
    notes.push("allowlist is required - declare authorized hostnames (*.example.com)");
    return { ok: false, target, allowlist: [], matched: false, notes };
  }

  if (!entries.length) {
    notes.push("No allowlist provided - target passed platform guard only");
    return { ok: true, target, allowlist: [], matched: true, notes };
  }

  const host = target.hostname;
  let matched = false;
  for (const entry of entries) {
    const e = entry.replace(/^\*\./, "");
    if (host === e || host === entry) {
      matched = true;
      break;
    }
    if (entry.startsWith("*.") && (host === e || host.endsWith(`.${e}`))) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    notes.push(`Target ${host} is not within the declared allowlist`);
    return { ok: false, target, allowlist: entries, matched: false, notes };
  }

  notes.push(`Target ${host} matches allowlist`);
  return { ok: true, target, allowlist: entries, matched: true, notes };
}
