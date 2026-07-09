/**
 * Concierge Surface Review — passive exposure breakdown for authorized targets.
 * No exploitation payloads; status + headers only. Hobby-safe parallel probes.
 */
import {
  assertOutOfPlatformScope,
  isPlatformSelfAuditHost,
  normalizeSecurityTarget,
  type SecurityScopeOptions,
} from "./concierge-security-scope";

const FETCH_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 2;

export type SurfaceSeverity = "info" | "low" | "medium" | "high";

export type SurfaceFinding = {
  id: string;
  severity: SurfaceSeverity;
  category: string;
  title: string;
  detail: string;
  evidence: string;
  remediation: string;
};

type FetchProbe = {
  url: string;
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  error?: string;
};

type PathProbeDef = {
  id: string;
  path: string;
  title: string;
  /** If true, HTTP 200 is flagged as high-severity exposure. */
  sensitive?: boolean;
};

const SURFACE_PATH_PROBES: PathProbeDef[] = [
  { id: "env-file", path: "/.env", title: "Environment file", sensitive: true },
  { id: "git-head", path: "/.git/HEAD", title: "Git repository metadata", sensitive: true },
  { id: "env-bak", path: "/.env.bak", title: "Environment backup", sensitive: true },
  { id: "security-txt", path: "/.well-known/security.txt", title: "security.txt" },
  { id: "security-txt-root", path: "/security.txt", title: "security.txt (root)" },
  { id: "robots", path: "/robots.txt", title: "robots.txt" },
  { id: "swagger", path: "/swagger", title: "Swagger UI" },
  { id: "api-docs", path: "/api-docs", title: "API docs surface" },
];

async function safeFetchProbe(
  pathOrUrl: string,
  baseOrigin?: string,
  options?: SecurityScopeOptions,
): Promise<FetchProbe> {
  let current = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : new URL(pathOrUrl, baseOrigin ?? "https://invalid.invalid").toString();

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const target = normalizeSecurityTarget(current);
      assertOutOfPlatformScope(target, undefined, options);

      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || hop === MAX_REDIRECTS) {
          return { url: current, ok: false, status: res.status, headers: {}, error: "too_many_redirects" };
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

function pushFinding(
  findings: SurfaceFinding[],
  finding: SurfaceFinding,
  seen: Set<string>,
) {
  if (seen.has(finding.id)) return;
  seen.add(finding.id);
  findings.push(finding);
}

function analyzeDisclosureHeaders(
  headers: Record<string, string>,
  origin: string,
  findings: SurfaceFinding[],
  seen: Set<string>,
) {
  for (const h of ["server", "x-powered-by", "x-aspnet-version", "x-generator"]) {
    const v = headers[h];
    if (!v) continue;
    pushFinding(
      findings,
      {
        id: `disclosure-${h}`,
        severity: "low",
        category: "Information disclosure",
        title: `Header reveals stack: ${h}`,
        detail: `Response exposes ${h}: ${v.slice(0, 120)}`,
        evidence: origin,
        remediation: "Remove or genericize server identification headers in production.",
      },
      seen,
    );
  }
}

/** Vercel edge self-fetches often strip Server; external clients still see it. */
function inferPlatformSelfAuditDisclosures(
  hostname: string,
  home: FetchProbe,
  origin: string,
  findings: SurfaceFinding[],
  seen: Set<string>,
  options?: SecurityScopeOptions,
) {
  if (!options?.selfAudit || !isPlatformSelfAuditHost(hostname)) return;
  if (home.headers.server || home.headers["x-powered-by"]) return;
  if (!home.headers["x-vercel-id"]) return;

  pushFinding(
    findings,
    {
      id: "disclosure-server",
      severity: "low",
      category: "Information disclosure",
      title: "Header reveals stack: server",
      detail: "External clients observe Server: Vercel on the public edge (stripped on same-origin edge probes).",
      evidence: origin,
      remediation: "Remove or genericize server identification headers in production.",
    },
    seen,
  );
}

function analyzeCookies(
  headers: Record<string, string>,
  isHttps: boolean,
  origin: string,
  findings: SurfaceFinding[],
  seen: Set<string>,
) {
  const raw = headers["set-cookie"];
  if (!raw) return;

  const cookies = raw.split(/,(?=\s*[\w.-]+=)/);
  for (const chunk of cookies) {
    const name = chunk.split("=")[0]?.trim() || "cookie";
    const lower = chunk.toLowerCase();
    if (isHttps && !lower.includes("secure")) {
      pushFinding(
        findings,
        {
          id: `cookie-no-secure-${name}`,
          severity: "medium",
          category: "Session cookies",
          title: `Cookie missing Secure flag: ${name}`,
          detail: "Session or auth cookies should set Secure on HTTPS origins.",
          evidence: origin,
          remediation: "Add Secure (and Prefer HttpOnly + SameSite) on sensitive cookies.",
        },
        seen,
      );
    }
    if (!lower.includes("httponly") && /session|auth|token|sid/i.test(chunk)) {
      pushFinding(
        findings,
        {
          id: `cookie-no-httponly-${name}`,
          severity: "medium",
          category: "Session cookies",
          title: `Sensitive cookie missing HttpOnly: ${name}`,
          detail: "Auth-like cookie names detected without HttpOnly.",
          evidence: origin,
          remediation: "Set HttpOnly on session and authentication cookies.",
        },
        seen,
      );
    }
  }
}

function analyzeCors(
  headers: Record<string, string>,
  origin: string,
  findings: SurfaceFinding[],
  seen: Set<string>,
) {
  const acao = headers["access-control-allow-origin"];
  if (!acao) return;
  if (acao === "*") {
    pushFinding(
      findings,
      {
        id: "cors-wildcard",
        severity: "medium",
        category: "CORS",
        title: "Access-Control-Allow-Origin: *",
        detail: "Wildcard CORS on the homepage/API sample may be intentional for public APIs — verify credentialed flows.",
        evidence: `${origin} → ${acao}`,
        remediation: "Restrict ACAO to trusted origins when cookies or privileged headers are used.",
      },
      seen,
    );
  }
}

function analyzeTransport(targetOrigin: string, home: FetchProbe, findings: SurfaceFinding[], seen: Set<string>) {
  const isHttps = targetOrigin.startsWith("https://");
  if (isHttps && !home.headers["strict-transport-security"]) {
    pushFinding(
      findings,
      {
        id: "missing-hsts",
        severity: "low",
        category: "Transport",
        title: "Strict-Transport-Security not set",
        detail: "HTTPS site without HSTS on the homepage response.",
        evidence: targetOrigin,
        remediation: "Add HSTS with includeSubDomains after HTTPS is stable.",
      },
      seen,
    );
  }
  if (!isHttps) {
    pushFinding(
      findings,
      {
        id: "no-tls",
        severity: "high",
        category: "Transport",
        title: "Target is not HTTPS",
        detail: "Audits should prefer https:// origins for production apps.",
        evidence: targetOrigin,
        remediation: "Enforce TLS and redirect HTTP to HTTPS.",
      },
      seen,
    );
  }
}

function analyzePathProbes(
  probes: { def: PathProbeDef; probe: FetchProbe }[],
  origin: string,
  findings: SurfaceFinding[],
  seen: Set<string>,
) {
  let hasSecurityTxt = false;

  for (const { def, probe } of probes) {
    if (def.id === "security-txt" || def.id === "security-txt-root") {
      if (probe.status === 200) hasSecurityTxt = true;
    }

    if (def.sensitive && probe.status === 200) {
      pushFinding(
        findings,
        {
          id: `exposed-${def.id}`,
          severity: "high",
          category: "Sensitive path exposure",
          title: `${def.title} reachable (HTTP 200)`,
          detail: `Passive GET ${def.path} returned 200 — verify this is not a real secret leak.`,
          evidence: probe.url,
          remediation: `Block public access to ${def.path}; return 404/403 from the edge.`,
        },
        seen,
      );
      continue;
    }

    if (!def.sensitive && probe.status === 200) {
      const severity: SurfaceSeverity =
        def.id === "swagger" || def.id === "api-docs" ? "info" : "info";
      pushFinding(
        findings,
        {
          id: `reachable-${def.id}`,
          severity,
          category: "Public surface",
          title: `${def.title} is publicly reachable`,
          detail: `GET ${def.path} returned HTTP ${probe.status}.`,
          evidence: probe.url,
          remediation: "Confirm this exposure is intentional for your threat model.",
        },
        seen,
      );
    }
  }

  if (!hasSecurityTxt) {
    pushFinding(
      findings,
      {
        id: "no-security-txt",
        severity: "info",
        category: "Security contact",
        title: "No security.txt discovered",
        detail: "Neither /.well-known/security.txt nor /security.txt returned 200.",
        evidence: origin,
        remediation: "Publish security.txt for coordinated disclosure / bug bounty contact.",
      },
      seen,
    );
  }
}

function countBySeverity(findings: SurfaceFinding[]) {
  const counts = { info: 0, low: 0, medium: 0, high: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

function surfaceGrade(counts: ReturnType<typeof countBySeverity>): string {
  if (counts.high > 0) return "elevated";
  if (counts.medium >= 2) return "watch";
  if (counts.medium === 1 || counts.low >= 3) return "moderate";
  if (counts.low > 0 || counts.info > 0) return "clear";
  return "minimal";
}

export type SecuritySurfaceReport = {
  ok: true;
  kind: "security-surface";
  target: { origin: string; hostname: string };
  auditedAt: string;
  framework: "concierge-surface-review-v1";
  summary: {
    total: number;
    bySeverity: { info: number; low: number; medium: number; high: number };
    grade: string;
  };
  findings: SurfaceFinding[];
  probes: {
    homeStatus: number;
    paths: { id: string; path: string; status: number; url: string }[];
  };
  disclaimer: string;
};

/** Passive surface / exposure breakdown — Concierge-branded, no active exploitation. */
export async function runSecuritySurfaceAudit(
  targetRaw: string,
  options?: SecurityScopeOptions,
): Promise<SecuritySurfaceReport> {
  const target = normalizeSecurityTarget(targetRaw);
  assertOutOfPlatformScope(target, undefined, options);

  const origin = target.origin;
  const isHttps = origin.startsWith("https://");

  const [home, ...pathResults] = await Promise.all([
    safeFetchProbe("/", origin, options),
    ...SURFACE_PATH_PROBES.map(async (def) => ({
      def,
      probe: await safeFetchProbe(def.path, origin, options),
    })),
  ]);

  const findings: SurfaceFinding[] = [];
  const seen = new Set<string>();

  analyzeTransport(origin, home, findings, seen);
  analyzeDisclosureHeaders(home.headers, origin, findings, seen);
  inferPlatformSelfAuditDisclosures(target.hostname, home, origin, findings, seen, options);
  analyzeCookies(home.headers, isHttps, origin, findings, seen);
  analyzeCors(home.headers, origin, findings, seen);
  analyzePathProbes(pathResults, origin, findings, seen);

  findings.sort((a, b) => {
    const rank: Record<SurfaceSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
    return rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title);
  });

  const bySeverity = countBySeverity(findings);

  return {
    ok: true,
    kind: "security-surface",
    target: { origin: target.origin, hostname: target.hostname },
    auditedAt: new Date().toISOString(),
    framework: "concierge-surface-review-v1",
    summary: {
      total: findings.length,
      bySeverity,
      grade: surfaceGrade(bySeverity),
    },
    findings,
    probes: {
      homeStatus: home.status,
      paths: pathResults.map(({ def, probe }) => ({
        id: def.id,
        path: def.path,
        status: probe.status,
        url: probe.url,
      })),
    },
    disclaimer:
      "Concierge Surface Review — passive signals only. Confirm findings manually before bug bounty or remediation. No exploit payloads.",
  };
}
