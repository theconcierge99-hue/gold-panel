/**
 * Concierge Security Desk — full module catalog aligned to Oh My Open Pentest structure.
 * Concierge-branded only. Hobby plan runs passive modules through Executive; President desk = SOON.
 *
 * Reference (external): github.com/adityawid/oh-my-open-pentest — skill library, intelligence layer,
 * tool phases, client-side pentest, engagement modes. Not imported; parity map only.
 */

export type ScanAccessTier = "guest" | "deluxe" | "executive" | "president";

export type DeskPhaseId =
  | "scope"
  | "summary"
  | "reconnaissance"
  | "intelligence"
  | "web-security"
  | "client-side"
  | "exploitation"
  | "orchestration"
  | "reporting";

export type DeskModuleHobbyStatus = "live" | "soon";

export type ConciergeDeskModuleDef = {
  id: string;
  phase: DeskPhaseId;
  title: string;
  subtitle: string;
  /** Minimum TCX holder tier to see any data from this module. */
  minTier: ScanAccessTier;
  /** Minimum tier for full detail when live on Hobby. */
  detailMinTier?: ScanAccessTier;
  hobbyStatus: DeskModuleHobbyStatus;
  soonNote?: string;
  /** Maps to implemented Concierge handler (if any). */
  implementation?: "readiness" | "headers" | "surface" | "scope" | "summary";
};

export const DESK_PHASE_LABELS: Record<DeskPhaseId, string> = {
  scope: "Scope & authorization",
  summary: "Executive summary",
  reconnaissance: "Reconnaissance",
  intelligence: "Intelligence data layer",
  "web-security": "Web security & OWASP",
  "client-side": "Client-side review",
  exploitation: "Exploitation & skill playbooks",
  orchestration: "Agent orchestration",
  reporting: "Reporting & export",
};

/** Full OMOP-parity catalog — Concierge Security Desk. */
export const CONCIERGE_DESK_MODULE_DEFS: ConciergeDeskModuleDef[] = [
  // ── Scope (always free / attestation) ─────────────────────────────────────
  {
    id: "scope-validation",
    phase: "scope",
    title: "Scope validation",
    subtitle: "Platform guard, allowlist match, no outbound fetch",
    minTier: "guest",
    hobbyStatus: "live",
    implementation: "scope",
  },
  {
    id: "authorization-attestation",
    phase: "scope",
    title: "Authorization attestation",
    subtitle: "Caller confirms written permission — no exploitation",
    minTier: "guest",
    hobbyStatus: "live",
  },

  // ── Executive summary ─────────────────────────────────────────────────────
  {
    id: "executive-summary",
    phase: "summary",
    title: "Executive summary",
    subtitle: "Overall grade and posture snapshot",
    minTier: "guest",
    hobbyStatus: "live",
    implementation: "summary",
  },
  {
    id: "engagement-posture",
    phase: "summary",
    title: "Engagement posture score",
    subtitle: "Blended readiness, headers, and surface grade",
    minTier: "deluxe",
    hobbyStatus: "live",
    implementation: "summary",
  },

  // ── Reconnaissance (OMOP recon phase — passive on Hobby) ───────────────────
  {
    id: "agent-readiness",
    phase: "reconnaissance",
    title: "Agent readiness",
    subtitle: "OpenAPI, discovery files, MCP HTTP surface",
    minTier: "deluxe",
    detailMinTier: "executive",
    hobbyStatus: "live",
    implementation: "readiness",
  },
  {
    id: "http-security-headers",
    phase: "reconnaissance",
    title: "HTTP security headers",
    subtitle: "Six-header passive checklist",
    minTier: "deluxe",
    detailMinTier: "executive",
    hobbyStatus: "live",
    implementation: "headers",
  },
  {
    id: "surface-review",
    phase: "reconnaissance",
    title: "Concierge Surface Review",
    subtitle: "Transport, cookies, CORS, disclosure headers, sensitive paths",
    minTier: "deluxe",
    detailMinTier: "executive",
    hobbyStatus: "live",
    implementation: "surface",
  },
  {
    id: "path-discovery-passive",
    phase: "reconnaissance",
    title: "Passive path discovery",
    subtitle: "Hobby probe set: .env, .git, security.txt, robots, swagger, api-docs",
    minTier: "executive",
    hobbyStatus: "live",
    implementation: "surface",
  },
  {
    id: "technology-fingerprint",
    phase: "reconnaissance",
    title: "Technology fingerprint",
    subtitle: "Server / X-Powered-By disclosure from homepage response",
    minTier: "deluxe",
    detailMinTier: "executive",
    hobbyStatus: "live",
    implementation: "surface",
  },
  {
    id: "subdomain-reconnaissance",
    phase: "reconnaissance",
    title: "Subdomain reconnaissance",
    subtitle: "Passive subdomain discovery and DNS hints",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "Requires extended worker beyond Vercel Hobby edge limits.",
  },
  {
    id: "passive-dns-intel",
    phase: "reconnaissance",
    title: "Passive DNS intelligence",
    subtitle: "MX, TXT, SPF hints without active zone transfer",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON on extended infrastructure.",
  },
  {
    id: "port-service-correlation",
    phase: "reconnaissance",
    title: "Port & service correlation",
    subtitle: "Port → service → attack vector mapping (passive hints)",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "extended-path-discovery",
    phase: "reconnaissance",
    title: "Extended path discovery",
    subtitle: "Broader passive path catalog beyond Hobby probes",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "Scheduled after Hobby scale-out.",
  },

  // ── Intelligence data layer (OMOP intel files) ─────────────────────────────
  {
    id: "attack-chains",
    phase: "intelligence",
    title: "Attack chains",
    subtitle: "Multi-stage exploitation pathway hints",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "OMOP intelligence layer — President desk SOON.",
  },
  {
    id: "vuln-ontology",
    phase: "intelligence",
    title: "Vulnerability ontology",
    subtitle: "Structured vuln class mapping and detection patterns",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "waf-signatures",
    phase: "intelligence",
    title: "WAF signatures",
    subtitle: "WAF detection and bypass technique library",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "tech-correlations",
    phase: "intelligence",
    title: "Technology correlations",
    subtitle: "Stack → vulnerability correlation hints",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "cve-correlations",
    phase: "intelligence",
    title: "CVE correlations",
    subtitle: "Version-to-CVE passive correlation",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "endpoint-patterns",
    phase: "intelligence",
    title: "Endpoint patterns",
    subtitle: "API endpoint pattern library",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },

  // ── Web security & OWASP Top 10 mapping ───────────────────────────────────
  {
    id: "owasp-access-control",
    phase: "web-security",
    title: "OWASP A01 — Access control",
    subtitle: "CORS, auth surface hints (passive)",
    minTier: "executive",
    hobbyStatus: "live",
    implementation: "surface",
  },
  {
    id: "owasp-crypto-failures",
    phase: "web-security",
    title: "OWASP A02 — Cryptographic failures",
    subtitle: "TLS / HSTS posture (passive)",
    minTier: "executive",
    hobbyStatus: "live",
    implementation: "surface",
  },
  {
    id: "owasp-injection-hints",
    phase: "web-security",
    title: "OWASP A03 — Injection hints",
    subtitle: "Passive reflection signals — no exploit payloads on Concierge",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — passive hints only when live.",
  },
  {
    id: "owasp-insecure-design",
    phase: "web-security",
    title: "OWASP A04 — Insecure design",
    subtitle: "Rate-limit and design pattern signals",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "owasp-misconfiguration",
    phase: "web-security",
    title: "OWASP A05 — Security misconfiguration",
    subtitle: "Header gaps, disclosure, debug surface hints",
    minTier: "executive",
    hobbyStatus: "live",
    implementation: "headers",
  },
  {
    id: "owasp-vulnerable-components",
    phase: "web-security",
    title: "OWASP A06 — Vulnerable components",
    subtitle: "SCA-style component hints (passive)",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "owasp-auth-failures",
    phase: "web-security",
    title: "OWASP A07 — Authentication failures",
    subtitle: "Cookie flags, session surface (passive)",
    minTier: "executive",
    hobbyStatus: "live",
    implementation: "surface",
  },
  {
    id: "owasp-integrity",
    phase: "web-security",
    title: "OWASP A08 — Software integrity",
    subtitle: "SRI and supply-chain surface hints",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "owasp-logging",
    phase: "web-security",
    title: "OWASP A09 — Logging & monitoring",
    subtitle: "security.txt and disclosure contact posture",
    minTier: "executive",
    hobbyStatus: "live",
    implementation: "surface",
  },
  {
    id: "owasp-ssrf",
    phase: "web-security",
    title: "OWASP A10 — SSRF surface",
    subtitle: "User-controlled fetch surface hints (passive)",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },

  // ── Client-side (OMOP Playwright phase) ───────────────────────────────────
  {
    id: "client-dom-review",
    phase: "client-side",
    title: "DOM & client-side review",
    subtitle: "Browser automation for DOM XSS and SPA endpoints",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "Requires headless worker — President desk SOON.",
  },
  {
    id: "auth-flow-review",
    phase: "client-side",
    title: "Authentication flow review",
    subtitle: "Login / OAuth flow passive analysis",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "csrf-surface",
    phase: "client-side",
    title: "CSRF surface analysis",
    subtitle: "CSRF PoC discovery (authorized targets only)",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },

  // ── Exploitation & skill playbooks (OMOP skill library) ───────────────────
  {
    id: "skill-playbook-library",
    phase: "exploitation",
    title: "Skill playbook library",
    subtitle: "Vuln-class, protocol, framework, and payload playbooks",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "Full OMOP playbook catalog — President desk SOON on extended worker.",
  },
  {
    id: "recon-tool-orchestration",
    phase: "exploitation",
    title: "Recon tool orchestration",
    subtitle: "Multi-tool recon phase automation",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "web-exploitation-tools",
    phase: "exploitation",
    title: "Web exploitation tools",
    subtitle: "Active web testing toolchain (authorized engagements)",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — gated; Concierge gateway only with attestation.",
  },
  {
    id: "engagement-modes",
    phase: "exploitation",
    title: "Engagement modes",
    subtitle: "Careful · Recommended · YOLO autonomy profiles",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },

  // ── Agent orchestration (OMOP multi-agent) ────────────────────────────────
  {
    id: "multi-agent-orchestration",
    phase: "orchestration",
    title: "Multi-agent orchestration",
    subtitle: "Parallel sub-agent task dispatch",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "Requires separate worker — President desk SOON.",
  },
  {
    id: "background-agent-pool",
    phase: "orchestration",
    title: "Background agent pool",
    subtitle: "Async work-stealing agent queue",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },

  // ── Reporting ─────────────────────────────────────────────────────────────
  {
    id: "structured-export-json",
    phase: "reporting",
    title: "Structured JSON export",
    subtitle: "Machine-readable breakdown for integrators",
    minTier: "executive",
    hobbyStatus: "live",
  },
  {
    id: "pdf-report",
    phase: "reporting",
    title: "PDF engagement report",
    subtitle: "Consultancy-grade deliverable for bug bounty filing",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
  {
    id: "sarif-export",
    phase: "reporting",
    title: "SARIF export",
    subtitle: "SARIF 2.1.0 for code scanning integrations",
    minTier: "president",
    hobbyStatus: "soon",
    soonNote: "President desk — SOON.",
  },
];

export const DESK_FRAMEWORK_VERSION = "concierge-security-desk-v1";
