/**
 * Map worker raw output (httpx + nuclei JSON) → Concierge surface findings.
 */
export type ConciergeDeepFinding = {
  id: string;
  severity: "info" | "low" | "medium" | "high";
  category: string;
  title: string;
  detail: string;
  evidence?: string;
  remediation?: string;
};

type SeverityCounts = { info: number; low: number; medium: number; high: number };

function emptySev(): SeverityCounts {
  return { info: 0, low: 0, medium: 0, high: 0 };
}

function mapNucleiSeverity(raw: unknown): ConciergeDeepFinding["severity"] {
  const s = String(raw ?? "info").toLowerCase();
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low") return "low";
  return "info";
}

function surfaceGradeFrom(counts: SeverityCounts, total: number): string {
  if (counts.high >= 3) return "elevated";
  if (counts.high >= 1 || counts.medium >= 4) return "watch";
  if (counts.medium >= 1 || counts.low >= 5) return "moderate";
  if (total === 0) return "clear";
  return "minimal";
}

function overallGradeFrom(counts: SeverityCounts): string {
  if (counts.high >= 2) return "D";
  if (counts.high >= 1) return "C";
  if (counts.medium >= 3) return "C";
  if (counts.medium >= 1) return "B";
  if (counts.low >= 4) return "B";
  return "A";
}

function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  return [];
}

function findingFromNuclei(row: Record<string, unknown>, idx: number): ConciergeDeepFinding | null {
  const info = (row.info as Record<string, unknown> | undefined) ?? {};
  const name = String(info.name ?? row["template-id"] ?? row.template_id ?? `Finding ${idx + 1}`);
  const templateId = String(row["template-id"] ?? row.template_id ?? row["template-path"] ?? idx);
  const severity = mapNucleiSeverity(info.severity ?? row.severity);
  const matched = String(row["matched-at"] ?? row.matched_at ?? row.host ?? "");
  const description = String(info.description ?? "").slice(0, 500);
  const remediationRaw =
    typeof info.remediation === "string"
      ? info.remediation
      : "Review and remediate according to Concierge Security Desk guidance.";
  const remediation = remediationRaw.slice(0, 400);
  return {
    id: `deep:${templateId}:${idx}`,
    severity,
    category: String(
      (Array.isArray(info.tags) && info.tags[0]) || info.classification || "exposure",
    ).slice(0, 64),
    title: name.slice(0, 160),
    detail: description || (matched ? `Matched at ${matched}` : "Template match on authorized target."),
    evidence: matched ? `matched=${matched}` : undefined,
    remediation: remediation || undefined,
  };
}

export function normalizeDeepScanRaw(
  raw: unknown,
  target: { origin: string; hostname: string },
  opts?: { profile?: string; auditedAt?: string },
): Record<string, unknown> {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nucleiRows = asArray(root.nuclei ?? root.findings).filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object",
  );
  const httpx =
    root.httpx && typeof root.httpx === "object" ? (root.httpx as Record<string, unknown>) : {};

  const findings: ConciergeDeepFinding[] = [];
  for (let i = 0; i < nucleiRows.length; i++) {
    const f = findingFromNuclei(nucleiRows[i], i);
    if (f) findings.push(f);
  }

  const bySeverity = emptySev();
  for (const f of findings) bySeverity[f.severity] += 1;

  const recommendations = findings
    .filter((f) => f.severity === "high" || f.severity === "medium")
    .slice(0, 8)
    .map((f) => f.remediation || `${f.title} — review and harden.`);

  const surfaceGrade = surfaceGradeFrom(bySeverity, findings.length);
  const overallGrade = overallGradeFrom(bySeverity);

  return {
    kind: "security-deep-scan",
    auditedAt: opts?.auditedAt ?? new Date().toISOString(),
    target,
    summary: {
      overallGrade,
      surfaceGrade,
      surfaceFindings: findings.length,
      surfaceBySeverity: bySeverity,
      tooling: {
        httpx: true,
        nuclei: true,
        profile: opts?.profile ?? "passive-web",
      },
    },
    breakdown: {
      surface: {
        findings,
        summary: { bySeverity, total: findings.length, grade: surfaceGrade },
      },
      httpx: {
        statusCode: httpx.status_code ?? httpx.statusCode ?? null,
        title: httpx.title ?? null,
        tech: httpx.tech ?? httpx.technologies ?? [],
        webserver: httpx.webserver ?? null,
      },
    },
    recommendations,
  };
}

/** Local/dev stub when worker URL is unset */
export function stubDeepScanResult(
  target: { origin: string; hostname: string },
  profile: string,
): Record<string, unknown> {
  return normalizeDeepScanRaw(
    {
      httpx: { status_code: 200, title: target.hostname, tech: [] },
      nuclei: [
        {
          "template-id": "worker-pending",
          info: {
            name: "Deep Scan worker not connected",
            severity: "info",
            description:
              "Job accepted. Configure SECURITY_DEEP_SCAN_WORKER_URL to run live template probes on an external worker.",
            remediation: "Deploy the Concierge deep-scan worker and set SECURITY_DEEP_SCAN_WORKER_URL.",
          },
          "matched-at": target.origin,
        },
      ],
    },
    target,
    { profile },
  );
}
