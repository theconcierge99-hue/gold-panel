/**
 * Passive security desk — agent-readiness + HTTP security headers for external targets.
 * Outbound fetches only after platform scope guard passes.
 */
import {
  assertOutOfPlatformScope,
  normalizeSecurityTarget,
  SECURITY_ROUTE_TIERS,
  validateScopeAllowlist,
  type NormalizedSecurityTarget,
  type SecurityAccessTier,
  type SecurityScopeOptions,
} from "./concierge-security-scope";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

type SecurityAuditOptions = SecurityScopeOptions;

async function safeFetchProbe(
  pathOrUrl: string,
  baseOrigin?: string,
  options?: SecurityAuditOptions,
): Promise<FetchProbe> {
  let current = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : new URL(pathOrUrl, baseOrigin ?? "https://invalid.invalid").toString();

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const target = normalizeSecurityTarget(current);
      assertOutOfPlatformScope(target, undefined, options);

      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || hop === MAX_REDIRECTS) {
          return {
            url: current,
            ok: false,
            status: res.status,
            headers: {},
            error: "too_many_redirects",
          };
        }
        current = new URL(loc, current).toString();
        continue;
      }

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { url: current, ok: res.ok, status: res.status, headers };
    }

    return { url: current, ok: false, status: 0, headers: {}, error: "redirect_loop" };
  } catch (e) {
    return {
      url: current,
      ok: false,
      status: 0,
      headers: {},
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}

const SCORE_LABELS: Record<number, string> = {
  0: "absent",
  1: "partial",
  2: "present",
  3: "exemplary",
};

const SECURITY_HEADER_CHECKS: { id: string; header: string; recommendation: string }[] = [
  { id: "x-content-type-options", header: "x-content-type-options", recommendation: "nosniff" },
  { id: "x-frame-options", header: "x-frame-options", recommendation: "SAMEORIGIN or DENY" },
  { id: "referrer-policy", header: "referrer-policy", recommendation: "strict-origin-when-cross-origin" },
  {
    id: "content-security-policy",
    header: "content-security-policy",
    recommendation: "restrict script/style sources",
  },
  {
    id: "strict-transport-security",
    header: "strict-transport-security",
    recommendation: "max-age with includeSubDomains on HTTPS",
  },
  { id: "permissions-policy", header: "permissions-policy", recommendation: "restrict sensitive features" },
];

type FetchProbe = {
  url: string;
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  error?: string;
};

async function fetchProbe(url: string, init?: RequestInit): Promise<FetchProbe> {
  if (init && Object.keys(init).length > 0) {
    try {
      const res = await fetch(url, {
        redirect: "manual",
        ...init,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { url, ok: res.ok, status: res.status, headers };
    } catch (e) {
      return {
        url,
        ok: false,
        status: 0,
        headers: {},
        error: e instanceof Error ? e.message : "fetch failed",
      };
    }
  }
  return safeFetchProbe(url);
}

function auditOptionsFromSelf(selfAudit?: boolean): SecurityAuditOptions | undefined {
  return selfAudit ? { selfAudit: true } : undefined;
}

function collectOperations(openapi: Record<string, unknown> | null) {
  const ops: { path: string; method: string; op: Record<string, unknown> }[] = [];
  const paths = (openapi?.paths ?? {}) as Record<string, Record<string, unknown>>;
  for (const [path, item] of Object.entries(paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const op = item?.[method];
      if (op && typeof op === "object") ops.push({ path, method: method.toUpperCase(), op: op as Record<string, unknown> });
    }
  }
  return ops;
}

function scoreSpecPresence(openapi: Record<string, unknown> | null, openApiStatus: number, origin: string) {
  if (!openapi || !String(openapi.openapi ?? "").startsWith("3.")) {
    return { score: 0, evidence: `${origin}/openapi.json`, notes: ["No OpenAPI 3.x document"] };
  }
  const pathCount = Object.keys((openapi.paths as object) ?? {}).length;
  const opCount = collectOperations(openapi).length;
  if (openApiStatus !== 200) {
    return { score: 1, evidence: `${origin}/openapi.json`, notes: ["Spec exists but not publicly reachable"] };
  }
  const guidance = openapi.info && (openapi.info as Record<string, unknown>)["x-guidance"];
  if (pathCount >= 5 && typeof guidance === "string") {
    return {
      score: 3,
      evidence: `${origin}/openapi.json`,
      notes: [`OpenAPI ${openapi.openapi} - ${pathCount} paths / ${opCount} operations`, "info.x-guidance present"],
    };
  }
  return {
    score: 2,
    evidence: `${origin}/openapi.json`,
    notes: [`OpenAPI ${openapi.openapi}, ${pathCount} paths`],
  };
}

function scoreDiscovery(probes: Record<string, boolean>, origin: string) {
  const found = [
    probes.wellKnownX402 && "/.well-known/x402",
    probes.apiCatalog && "/.well-known/api-catalog",
    probes.agentCard && "/.well-known/agent-card.json",
    probes.llmsTxt && "/llms.txt",
  ].filter(Boolean);
  if (found.length >= 3) {
    return { score: 3, evidence: origin, notes: [`Discovery files: ${found.join(", ")}`] };
  }
  if (found.length >= 1) {
    return { score: 1, evidence: origin, notes: [`Partial discovery: ${found.join(", ")}`] };
  }
  return { score: 0, evidence: origin, notes: ["No machine-readable API discovery files found"] };
}

function scoreSecurityHeaders(homeHeaders: Record<string, string>, origin: string) {
  const present: string[] = [];
  const missing: string[] = [];
  for (const check of SECURITY_HEADER_CHECKS) {
    if (homeHeaders[check.header]) present.push(check.id);
    else missing.push(check.id);
  }
  const score = present.length >= 5 ? 3 : present.length >= 3 ? 2 : present.length >= 1 ? 1 : 0;
  return {
    score,
    evidence: origin,
    notes: [
      `Present (${present.length}/${SECURITY_HEADER_CHECKS.length}): ${present.join(", ") || "none"}`,
      missing.length ? `Missing: ${missing.join(", ")}` : "All checked headers present",
    ],
  };
}

function meanScore(signals: { score: number }[]) {
  if (!signals.length) return 0;
  return signals.reduce((a, s) => a + s.score, 0) / signals.length;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type SecurityReadinessReport = {
  ok: true;
  kind: "security-readiness";
  target: { origin: string; hostname: string };
  auditedAt: string;
  framework: string;
  frameworkUrl: string;
  scores: { mean: number; max: number; dimensions: number };
  dimensions: {
    id: string;
    name: string;
    score: number;
    label: string;
    evidence: string;
    notes: string[];
  }[];
  probes: Record<string, unknown>;
  disclaimer: string;
};

export async function runSecurityReadinessAudit(
  targetRaw: string,
  options?: SecurityAuditOptions,
): Promise<SecurityReadinessReport> {
  const target = normalizeSecurityTarget(targetRaw);
  assertOutOfPlatformScope(target, undefined, options);

  const origin = target.origin;
  const probes: Record<string, unknown> = { origin };

  let openapi: Record<string, unknown> | null = null;
  let openApiStatus = 0;

  const [openApiProbe, x402Probe, agentCardProbe, llmsProbe, catalogProbe, homeProbe, mcpProbe] =
    await Promise.all([
      safeFetchProbe(`${origin}/openapi.json`, undefined, options),
      safeFetchProbe("/.well-known/x402", origin, options),
      safeFetchProbe("/.well-known/agent-card.json", origin, options),
      safeFetchProbe("/llms.txt", origin, options),
      safeFetchProbe("/.well-known/api-catalog", origin, options),
      safeFetchProbe("/", origin, options),
      safeFetchProbe("/api/mcp", origin, options),
    ]);

  openApiStatus = openApiProbe.status;
  probes.openApiStatus = openApiStatus;
  if (openApiProbe.ok) {
    try {
      const text = await (
        await fetch(openApiProbe.url, {
          redirect: "manual",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
      ).text();
      openapi = JSON.parse(text) as Record<string, unknown>;
    } catch {
      openapi = null;
    }
  }

  const discoveryFlags = {
    wellKnownX402: x402Probe.ok,
    apiCatalog: catalogProbe.ok && (catalogProbe.headers["content-type"] ?? "").includes("linkset"),
    agentCard: agentCardProbe.ok,
    llmsTxt: llmsProbe.ok,
  };
  probes.discovery = discoveryFlags;

  probes.homeStatus = homeProbe.status;
  probes.homeError = homeProbe.error ?? null;
  probes.mcpReachable = mcpProbe.ok;

  const dimensions = [
    {
      id: "spec-presence",
      name: "OpenAPI spec presence",
      ...scoreSpecPresence(openapi, openApiStatus, origin),
    },
    {
      id: "api-discovery",
      name: "API discovery files",
      ...scoreDiscovery(discoveryFlags, origin),
    },
    {
      id: "security-headers",
      name: "HTTP security headers",
      ...scoreSecurityHeaders(homeProbe.headers, origin),
    },
    {
      id: "mcp-surface",
      name: "MCP / agent HTTP surface",
      score: mcpProbe.ok ? 2 : 0,
      evidence: `${origin}/api/mcp`,
      notes: mcpProbe.ok ? ["MCP HTTP endpoint reachable"] : ["No MCP endpoint at /api/mcp"],
    },
  ].map((d) => ({
    ...d,
    label: SCORE_LABELS[Math.min(3, Math.max(0, d.score))] ?? "unknown",
  }));

  const mean = meanScore(dimensions);

  return {
    ok: true,
    kind: "security-readiness",
    target: { origin: target.origin, hostname: target.hostname },
    auditedAt: new Date().toISOString(),
    framework: "api-evangelist/agent-readiness (passive subset)",
    frameworkUrl: "https://github.com/api-evangelist/agent-readiness",
    scores: { mean: round2(mean), max: 3, dimensions: dimensions.length },
    dimensions,
    probes,
    disclaimer:
      "Passive audit only - no exploitation. Target must be authorized by the caller. Concierge platform hosts are always blocked.",
  };
}

export type SecurityHeadersReport = {
  ok: true;
  kind: "security-headers";
  target: { origin: string; hostname: string };
  auditedAt: string;
  checks: {
    id: string;
    header: string;
    present: boolean;
    value: string | null;
    recommendation: string;
  }[];
  summary: { present: number; total: number; grade: string };
  probes: { home: FetchProbe; apiSample: FetchProbe | null };
  disclaimer: string;
};

export async function runSecurityHeadersAudit(
  targetRaw: string,
  options?: SecurityAuditOptions,
): Promise<SecurityHeadersReport> {
  const target = normalizeSecurityTarget(targetRaw);
  assertOutOfPlatformScope(target, undefined, options);

  const [home, apiSample] = await Promise.all([
    safeFetchProbe("/", target.origin, options),
    safeFetchProbe("/api/openapi", target.origin, options),
  ]);

  const mergedHeaders = { ...home.headers };
  if (apiSample) {
    for (const [k, v] of Object.entries(apiSample.headers)) {
      if (!mergedHeaders[k]) mergedHeaders[k] = v;
    }
  }

  const checks = SECURITY_HEADER_CHECKS.map((c) => ({
    id: c.id,
    header: c.header,
    present: Boolean(mergedHeaders[c.header]),
    value: mergedHeaders[c.header] ?? null,
    recommendation: c.recommendation,
  }));

  const present = checks.filter((c) => c.present).length;
  const total = checks.length;
  const grade =
    present >= 5 ? "strong" : present >= 3 ? "moderate" : present >= 1 ? "weak" : "missing";

  return {
    ok: true,
    kind: "security-headers",
    target: { origin: target.origin, hostname: target.hostname },
    auditedAt: new Date().toISOString(),
    checks,
    summary: { present, total, grade },
    probes: { home, apiSample },
    disclaimer:
      "Passive header review only. No vulnerability scanning. Concierge platform hosts are always blocked.",
  };
}

function overallGradeFromScores(readinessMean: number, headersGrade: string): string {
  const headerScore =
    headersGrade === "strong" ? 3 : headersGrade === "moderate" ? 2 : headersGrade === "weak" ? 1 : 0;
  const blended = (readinessMean + headerScore) / 2;
  if (blended >= 2.5) return "A";
  if (blended >= 2) return "B";
  if (blended >= 1.5) return "C";
  if (blended >= 1) return "D";
  return "F";
}

function buildScanRecommendations(
  readiness: SecurityReadinessReport,
  headers: SecurityHeadersReport,
): string[] {
  const recs: string[] = [];
  for (const dim of readiness.dimensions) {
    if (dim.score < 2) recs.push(`${dim.name}: ${dim.notes[0] ?? "improve posture"}`);
  }
  for (const check of headers.checks) {
    if (!check.present) recs.push(`Add ${check.header} — ${check.recommendation}`);
  }
  return recs.slice(0, 12);
}

export type SecurityScanReport = {
  ok: true;
  kind: "security-scan";
  target: { origin: string; hostname: string };
  auditedAt: string;
  summary: {
    overallGrade: string;
    readinessScore: number;
    readinessMax: number;
    headersGrade: string;
    headersPresent: number;
    headersTotal: number;
    discoveryFiles: number;
    mcpReachable: boolean;
  };
  breakdown: {
    readiness: SecurityReadinessReport;
    headers: SecurityHeadersReport;
  };
  recommendations: string[];
  disclaimer: string;
};

/** Unified passive website security breakdown — readiness + headers in one call. */
export async function runSecurityScanAudit(
  targetRaw: string,
  options?: SecurityAuditOptions,
): Promise<SecurityScanReport> {
  const [readiness, headers] = await Promise.all([
    runSecurityReadinessAudit(targetRaw, options),
    runSecurityHeadersAudit(targetRaw, options),
  ]);

  const discovery = readiness.probes.discovery as Record<string, boolean> | undefined;
  const discoveryCount = discovery
    ? Object.values(discovery).filter(Boolean).length
    : 0;

  const summary = {
    overallGrade: overallGradeFromScores(readiness.scores.mean, headers.summary.grade),
    readinessScore: readiness.scores.mean,
    readinessMax: readiness.scores.max,
    headersGrade: headers.summary.grade,
    headersPresent: headers.summary.present,
    headersTotal: headers.summary.total,
    discoveryFiles: discoveryCount,
    mcpReachable: Boolean(readiness.probes.mcpReachable),
  };

  return {
    ok: true,
    kind: "security-scan",
    target: readiness.target,
    auditedAt: new Date().toISOString(),
    summary,
    breakdown: { readiness, headers },
    recommendations: buildScanRecommendations(readiness, headers),
    disclaimer:
      options?.selfAudit
        ? "Passive self-audit on the canonical Concierge public site — no exploitation."
        : "Passive security breakdown only — no exploitation or vulnerability scanning. Target must be authorized.",
  };
}

export type SecurityScopeReport = {
  ok: boolean;
  kind: "security-scope";
  target: NormalizedSecurityTarget;
  platformGuard: { passed: boolean };
  allowlist: string[];
  allowlistMatched: boolean;
  notes: string[];
  tier: SecurityAccessTier;
  disclaimer: string;
};

export function runSecurityScopeValidation(
  targetRaw: string,
  allowlist: unknown,
  request?: Request,
  options?: { requireEntries?: boolean; selfAudit?: boolean },
): SecurityScopeReport {
  const scopeOpts = auditOptionsFromSelf(options?.selfAudit);
  const target = normalizeSecurityTarget(targetRaw);
  assertOutOfPlatformScope(target, request, scopeOpts);
  const allow = validateScopeAllowlist(target, allowlist, options);

  return {
    ok: allow.ok,
    kind: "security-scope",
    target,
    platformGuard: { passed: true },
    allowlist: allow.allowlist,
    allowlistMatched: allow.matched,
    notes: allow.notes,
    tier: SECURITY_ROUTE_TIERS["security-scope"],
    disclaimer: options?.selfAudit
      ? "Self-audit scope validation for the canonical Concierge public site."
      : "Scope validation only - no active testing.",
  };
}
