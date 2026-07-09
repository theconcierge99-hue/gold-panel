/**
 * Security Desk verdict + Concierge AI prompt block from passive scan research.
 */
import type { SecurityScanReport } from "./concierge-security-audit";

export type SecurityVerdictSignal = "acceptable" | "watch" | "harden" | "remediate" | "critical";

export type SecurityVerdict = {
  signal: SecurityVerdictSignal;
  confidence: "low" | "medium" | "high";
  headline: string;
  rationale: string[];
};

export type ClientSecurityScanContext = {
  target: { origin: string; hostname: string };
  auditedAt: string;
  summary: SecurityScanReport["summary"];
  recommendations: string[];
  verdict: SecurityVerdict;
  topFindings?: { severity: string; title: string; category: string }[];
  readinessHighlights?: { name: string; label: string; score: number }[];
  missingHeaders?: string[];
};

const SECURITY_INTEL_RE =
  /\b(security scan|security desk|posture|readiness|headers?|hsts|csp|x-frame|owasp|surface review|exposure finding|remediate|harden|self-audit|authorized audit|security verdict|scan result|audit result|website security|api security)\b/i;

export function wantsSecurityIntel(message: string): boolean {
  return SECURITY_INTEL_RE.test(message);
}

export function buildSecurityVerdict(
  report: Pick<SecurityScanReport, "summary" | "recommendations" | "target">,
): SecurityVerdict {
  const s = report.summary;
  const sev = s.surfaceBySeverity ?? { info: 0, low: 0, medium: 0, high: 0 };
  const grade = String(s.overallGrade ?? "").toUpperCase();
  const rationale: string[] = [];
  let score = 0;

  if (grade === "A") {
    score += 2;
    rationale.push(`Overall grade ${grade} — strong passive posture on readiness, headers, and surface.`);
  } else if (grade === "B") {
    score += 1;
    rationale.push(`Overall grade ${grade} — acceptable baseline with room to harden.`);
  } else if (grade === "C") {
    score -= 1;
    rationale.push(`Overall grade ${grade} — mixed posture; address gaps before production exposure.`);
  } else if (grade === "D") {
    score -= 2;
    rationale.push(`Overall grade ${grade} — weak posture; prioritize remediation.`);
  } else if (grade === "F") {
    score -= 3;
    rationale.push(`Overall grade ${grade} — critical gaps across desk dimensions.`);
  } else {
    rationale.push(`Overall grade ${grade || "—"} — review scan evidence before relying on this target.`);
  }

  if (sev.high > 0) {
    score -= sev.high * 2;
    rationale.push(`${sev.high} high-severity surface finding(s) — treat as urgent exposure signals.`);
  }
  if (sev.medium > 0) {
    score -= Math.min(sev.medium, 3);
    rationale.push(`${sev.medium} medium-severity finding(s) — schedule remediation in the next hardening pass.`);
  }
  if (sev.low > 0 || sev.info > 0) {
    rationale.push(`Lower-severity signals: ${sev.low} low · ${sev.info} info — monitor during rollout.`);
  }

  if (s.readinessMax > 0 && s.readinessScore / s.readinessMax < 0.55) {
    score -= 1;
    rationale.push(
      `Readiness ${s.readinessScore}/${s.readinessMax} — discovery, MCP, or agent-card posture below desk threshold.`,
    );
  } else if (s.readinessMax > 0 && s.readinessScore / s.readinessMax >= 0.8) {
    score += 1;
    rationale.push(`Readiness ${s.readinessScore}/${s.readinessMax} — agent/API discoverability posture is solid.`);
  }

  const headersGrade = String(s.headersGrade ?? "").toLowerCase();
  if (headersGrade === "weak") {
    score -= 1;
    rationale.push(`Headers grade weak — ${s.headersPresent}/${s.headersTotal} security headers present.`);
  } else if (headersGrade === "strong") {
    score += 1;
    rationale.push(`Headers grade strong — baseline browser security headers in place.`);
  }

  const surfaceGrade = String(s.surfaceGrade ?? "").toLowerCase();
  if (surfaceGrade === "elevated" || surfaceGrade === "watch") {
    score -= 1;
    rationale.push(`Surface grade ${s.surfaceGrade} — passive path review flagged exposure patterns.`);
  }

  const priorityRecs = (report.recommendations ?? []).slice(0, 3);
  if (priorityRecs.length) {
    rationale.push(`Top remediation: ${priorityRecs.join(" · ")}`);
  }

  let signal: SecurityVerdictSignal = "watch";
  let confidence: SecurityVerdict["confidence"] = "medium";

  if (sev.high >= 2 || grade === "F" || score <= -4) {
    signal = "critical";
    confidence = "high";
  } else if (sev.high >= 1 || grade === "D" || score <= -2) {
    signal = "remediate";
    confidence = sev.high >= 1 ? "high" : "medium";
  } else if (grade === "C" || sev.medium >= 2 || score <= -1) {
    signal = "harden";
    confidence = "medium";
  } else if (grade === "A" && sev.high === 0 && sev.medium === 0 && score >= 2) {
    signal = "acceptable";
    confidence = "high";
  } else if (grade === "B" && sev.high === 0 && score >= 0) {
    signal = "watch";
    confidence = "medium";
  }

  const host = report.target?.hostname ?? "target";
  const headline =
    signal === "acceptable"
      ? `${host} — posture acceptable for cautious production use; maintain monitoring.`
      : signal === "watch"
        ? `${host} — watch posture — fix medium issues before scaling agent traffic.`
        : signal === "harden"
          ? `${host} — harden before production — close header and surface gaps.`
          : signal === "remediate"
            ? `${host} — remediate high-priority findings before trusting this endpoint.`
            : `${host} — critical exposure signals — do not route production agents until fixed.`;

  return { signal, confidence, headline, rationale: rationale.slice(0, 8) };
}

export function parseClientSecurityScan(raw: unknown): ClientSecurityScanContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const targetRaw = body.target;
  if (!targetRaw || typeof targetRaw !== "object") return null;
  const target = targetRaw as Record<string, unknown>;
  const origin = String(target.origin ?? "").trim().slice(0, 256);
  const hostname = String(target.hostname ?? "").trim().slice(0, 128);
  if (!origin || !hostname) return null;

  const summaryRaw = body.summary;
  if (!summaryRaw || typeof summaryRaw !== "object") return null;
  const summary = summaryRaw as SecurityScanReport["summary"];

  const verdictRaw = body.verdict;
  if (!verdictRaw || typeof verdictRaw !== "object") return null;
  const v = verdictRaw as Record<string, unknown>;
  const signal = String(v.signal ?? "").trim() as SecurityVerdictSignal;
  const confidence = String(v.confidence ?? "").trim() as SecurityVerdict["confidence"];
  const headline = String(v.headline ?? "").trim().slice(0, 400);
  if (!headline || !["acceptable", "watch", "harden", "remediate", "critical"].includes(signal)) {
    return null;
  }
  const rationale: string[] = [];
  if (Array.isArray(v.rationale)) {
    for (const line of v.rationale.slice(0, 10)) {
      const t = String(line ?? "").trim().slice(0, 320);
      if (t) rationale.push(t);
    }
  }

  const recommendations: string[] = [];
  if (Array.isArray(body.recommendations)) {
    for (const line of body.recommendations.slice(0, 12)) {
      const t = String(line ?? "").trim().slice(0, 320);
      if (t) recommendations.push(t);
    }
  }

  const topFindings: ClientSecurityScanContext["topFindings"] = [];
  if (Array.isArray(body.topFindings)) {
    for (const row of body.topFindings.slice(0, 8)) {
      if (!row || typeof row !== "object") continue;
      const f = row as Record<string, unknown>;
      const title = String(f.title ?? "").trim().slice(0, 160);
      if (!title) continue;
      topFindings.push({
        severity: String(f.severity ?? "").trim().slice(0, 16),
        title,
        category: String(f.category ?? "").trim().slice(0, 64),
      });
    }
  }

  const readinessHighlights: ClientSecurityScanContext["readinessHighlights"] = [];
  if (Array.isArray(body.readinessHighlights)) {
    for (const row of body.readinessHighlights.slice(0, 8)) {
      if (!row || typeof row !== "object") continue;
      const d = row as Record<string, unknown>;
      const name = String(d.name ?? "").trim().slice(0, 80);
      if (!name) continue;
      readinessHighlights.push({
        name,
        label: String(d.label ?? "").trim().slice(0, 40),
        score: Number(d.score) || 0,
      });
    }
  }

  const missingHeaders: string[] = [];
  if (Array.isArray(body.missingHeaders)) {
    for (const h of body.missingHeaders.slice(0, 12)) {
      const t = String(h ?? "").trim().slice(0, 64);
      if (t) missingHeaders.push(t);
    }
  }

  return {
    target: { origin, hostname },
    auditedAt: String(body.auditedAt ?? "").trim().slice(0, 40) || new Date().toISOString(),
    summary,
    recommendations,
    verdict: { signal, confidence: confidence || "medium", headline, rationale },
    topFindings: topFindings.length ? topFindings : undefined,
    readinessHighlights: readinessHighlights.length ? readinessHighlights : undefined,
    missingHeaders: missingHeaders.length ? missingHeaders : undefined,
  };
}

export function formatSecurityIntelForPrompt(scan: ClientSecurityScanContext): string {
  const s = scan.summary;
  const sev = s.surfaceBySeverity ?? { info: 0, low: 0, medium: 0, high: 0 };
  const lines: string[] = [
    `SECURITY DESK INTELLIGENCE (passive scan · ${scan.auditedAt}):`,
    `Target: ${scan.target.origin} (${scan.target.hostname})`,
    "Rules: Use ONLY this block for security posture, headers, surface findings, and SECURITY VERDICT. Do not invent CVEs, exploits, or findings outside this research. Passive audit only — not a penetration test.",
    "",
    `[SECURITY VERDICT — ${scan.verdict.confidence} confidence]`,
    `Signal: ${scan.verdict.signal.toUpperCase()} — ${scan.verdict.headline}`,
    ...scan.verdict.rationale.map((r) => `- ${r}`),
    "",
    "[SCAN SUMMARY]",
    `- Overall grade: ${s.overallGrade}`,
    `- Readiness: ${s.readinessScore}/${s.readinessMax}`,
    `- Headers: ${s.headersGrade} (${s.headersPresent}/${s.headersTotal})`,
    `- Surface: ${s.surfaceGrade} · ${s.surfaceFindings ?? 0} findings`,
    `- Severity: ${sev.high} high · ${sev.medium} medium · ${sev.low} low · ${sev.info} info`,
    `- Discovery files: ${s.discoveryFiles} · MCP reachable: ${s.mcpReachable ? "yes" : "no"}`,
  ];

  if (scan.readinessHighlights?.length) {
    lines.push("", "[READINESS — dimension highlights]");
    for (const d of scan.readinessHighlights) {
      lines.push(`- ${d.name}: ${d.label} (${d.score}/3)`);
    }
  }
  if (scan.missingHeaders?.length) {
    lines.push("", "[HEADERS — missing]");
    for (const h of scan.missingHeaders) lines.push(`- ${h}`);
  }
  if (scan.topFindings?.length) {
    lines.push("", "[SURFACE — top findings]");
    for (const f of scan.topFindings) {
      lines.push(`- [${f.severity}] ${f.title} (${f.category})`);
    }
  }
  if (scan.recommendations.length) {
    lines.push("", "[RECOMMENDATIONS]");
    for (const r of scan.recommendations) lines.push(`- ${r}`);
  }

  return lines.join("\n");
}
