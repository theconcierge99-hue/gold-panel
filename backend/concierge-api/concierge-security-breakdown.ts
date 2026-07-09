/**
 * Concierge Security Desk — tiered breakdown filter (pay-per-call depth by TCX tier).
 *
 * Pre-launch (default): live ceiling = Guest only. Deluxe+ depth is prepared but waitlisted.
 * Post-launch: set SECURITY_DESK_LIVE_MAX_TIER=executive (or deluxe) when TCX mint is live,
 * or rely on isSoonLaunched() + default post-launch ceiling.
 */
import type { SecurityScanReport } from "./concierge-security-audit";
import { buildSecurityVerdict, type SecurityVerdict } from "./concierge-security-intel";
import {
  getSoonBalanceAtomic,
  getSoonDecimals,
  isSoonLaunched,
  resolveSoonTier,
} from "./soon-token";
import { walletFromSecurityRequest } from "./soon-security-tier";
import {
  CONCIERGE_DESK_MODULE_DEFS,
  DESK_FRAMEWORK_VERSION,
  DESK_PHASE_LABELS,
  type ConciergeDeskModuleDef,
  type DeskPhaseId,
  type ScanAccessTier,
} from "./concierge-security-desk-catalog";

export type { ScanAccessTier } from "./concierge-security-desk-catalog";
export { CONCIERGE_DESK_MODULE_DEFS, DESK_PHASE_LABELS, DESK_FRAMEWORK_VERSION };

/** Passive live depth for holder's when TCX is launched (Hobby still caps President extended). */
export const HOBBY_LIVE_MAX_TIER: ScanAccessTier = "executive";

/** Pre-launch public live depth — Guest breakdown only until TCX is switched on. */
export const PRE_LAUNCH_LIVE_MAX_TIER: ScanAccessTier = "guest";

const TIER_RANK: Record<ScanAccessTier, number> = {
  guest: 0,
  deluxe: 1,
  executive: 2,
  president: 3,
};

const TIER_LABEL: Record<ScanAccessTier, string> = {
  guest: "Guest",
  deluxe: "Deluxe",
  executive: "Executive",
  president: "President",
};

export const SECURITY_DESK_LEGAL_NOTICE =
  "Concierge Security Desk — passive reconnaissance only. Do not exploit, hack, or probe systems without written authorization. Illegal use is prohibited; you accept full responsibility for your actions. Concierge disclaims liability for misuse.";

export type DeskModuleStatus = "live" | "soon" | "locked";

export type ConciergeDeskModule = {
  id: string;
  phase: DeskPhaseId;
  phaseLabel: string;
  title: string;
  subtitle: string;
  status: DeskModuleStatus;
  minTier: ScanAccessTier;
  detailMinTier: ScanAccessTier;
  hobbyStatus: "live" | "soon";
  soonNote: string | null;
  implementation: ConciergeDeskModuleDef["implementation"] | null;
};

export type DeskPhaseGroup = {
  id: DeskPhaseId;
  label: string;
  modules: ConciergeDeskModule[];
};

export type ScanAccessMeta = {
  tier: ScanAccessTier;
  tierLabel: string;
  /** Effective live ceiling right now (guest pre-launch; up to executive post-launch). */
  liveCeiling: ScanAccessTier;
  /** Alias kept for older clients. */
  hobbyCeiling: ScanAccessTier;
  tcxLaunched: boolean;
  framework: string;
  upgradeHint: string | null;
  legalNotice: string;
  moduleCounts: { live: number; soon: number; locked: number };
};

export type SecurityScanReportTiered = SecurityScanReport & {
  verdict?: SecurityVerdict | null;
  access: ScanAccessMeta;
  deskModules: ConciergeDeskModule[];
  deskPhases: DeskPhaseGroup[];
};

const OWNER_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function tierMeets(have: ScanAccessTier, need: ScanAccessTier): boolean {
  return TIER_RANK[have] >= TIER_RANK[need];
}

function clampTier(tier: ScanAccessTier, ceiling: ScanAccessTier): ScanAccessTier {
  return TIER_RANK[tier] <= TIER_RANK[ceiling] ? tier : ceiling;
}

/**
 * Live breakdown ceiling.
 * - Pre-launch (no TCX mint / snapshot off): Guest only.
 * - Post-launch: HOBBY_LIVE_MAX_TIER (executive) unless SECURITY_DESK_LIVE_MAX_TIER overrides.
 */
export function resolveLiveCeiling(): ScanAccessTier {
  const raw = (process.env.SECURITY_DESK_LIVE_MAX_TIER ?? "").trim().toLowerCase();
  if (raw === "guest" || raw === "deluxe" || raw === "executive" || raw === "president") {
    return raw;
  }
  if (!isSoonLaunched()) return PRE_LAUNCH_LIVE_MAX_TIER;
  return HOBBY_LIVE_MAX_TIER;
}

function upgradeHintFor(tier: ScanAccessTier, liveCeiling: ScanAccessTier, launched: boolean): string | null {
  if (!launched || liveCeiling === "guest") {
    return "Deeper TCX holder breakdown equips after token launch.";
  }
  if (tier === "president") {
    return "Extended desk modules are listed — activation waits for worker rollout.";
  }
  if (tier === "executive") {
    return "President unlocks the extended desk catalog when live.";
  }
  if (tier === "deluxe") {
    return "Executive unlocks full evidence and path probes.";
  }
  return "Hold TCX Deluxe+ for deeper breakdown on the same paid scan.";
}

function moduleStatus(
  def: ConciergeDeskModuleDef,
  _accessTier: ScanAccessTier,
  liveCeiling: ScanAccessTier,
): DeskModuleStatus {
  // Above current live ceiling → Soon (prepared, not switched on yet).
  if (!tierMeets(liveCeiling, def.minTier)) return "soon";
  // Explicit Hobby-extended modules remain Soon until worker rollout.
  if (def.hobbyStatus === "soon") return "soon";
  return "live";
}

export function buildDeskModuleCatalog(
  accessTier: ScanAccessTier,
  liveCeiling: ScanAccessTier = resolveLiveCeiling(),
): ConciergeDeskModule[] {
  return CONCIERGE_DESK_MODULE_DEFS.map((def) => {
    const detailMin = def.detailMinTier ?? def.minTier;
    const status = moduleStatus(def, accessTier, liveCeiling);
    const waitlisted = !tierMeets(liveCeiling, def.minTier);
    return {
      id: def.id,
      phase: def.phase,
      phaseLabel: DESK_PHASE_LABELS[def.phase],
      title: def.title,
      subtitle: def.subtitle,
      status,
      minTier: def.minTier,
      detailMinTier: detailMin,
      hobbyStatus: def.hobbyStatus,
      soonNote:
        status === "soon"
          ? waitlisted
            ? "Soon — unlocks after TCX launch."
            : (def.soonNote ?? "Soon — rollout pending.")
          : null,
      implementation: def.implementation ?? null,
    };
  });
}

export function buildDeskPhaseGroups(modules: ConciergeDeskModule[]): DeskPhaseGroup[] {
  const order: DeskPhaseId[] = [
    "scope",
    "summary",
    "reconnaissance",
    "intelligence",
    "web-security",
    "client-side",
    "exploitation",
    "orchestration",
    "reporting",
  ];
  const byPhase = new Map<DeskPhaseId, ConciergeDeskModule[]>();
  for (const m of modules) {
    const list = byPhase.get(m.phase) ?? [];
    list.push(m);
    byPhase.set(m.phase, list);
  }
  return order
    .filter((id) => byPhase.has(id))
    .map((id) => ({
      id,
      label: DESK_PHASE_LABELS[id],
      modules: byPhase.get(id)!,
    }));
}

/** Resolve breakdown tier from holder wallet header or x402 payer address. */
export async function resolveScanAccessTier(
  request: Request,
  payerWallet?: string | null,
  opts?: { selfAudit?: boolean; devBypass?: boolean },
): Promise<ScanAccessTier> {
  const ceiling = resolveLiveCeiling();
  let resolved: ScanAccessTier = "guest";

  if (opts?.selfAudit || opts?.devBypass) {
    resolved = HOBBY_LIVE_MAX_TIER;
  } else {
    const headerWallet = walletFromSecurityRequest(request);
    const payer =
      headerWallet ??
      (payerWallet && OWNER_RE.test(payerWallet) ? payerWallet : null);

    if (payer) {
      const balanceAtomic = await getSoonBalanceAtomic(payer);
      if (balanceAtomic !== null) {
        const balanceUi = Number(balanceAtomic) / 10 ** getSoonDecimals();
        const tier = resolveSoonTier(balanceUi);
        resolved = tier?.id ?? "guest";
      }
    }
  }

  // Pre-launch ceiling = guest → everyone sees Guest depth until TCX is switched on.
  return clampTier(resolved, ceiling);
}

function filterReadiness(
  report: SecurityScanReport,
  tier: ScanAccessTier,
): SecurityScanReport["breakdown"]["readiness"] {
  const r = report.breakdown.readiness;
  if (!tierMeets(tier, "deluxe")) {
    return { ...r, dimensions: [], probes: { origin: r.probes.origin as string } };
  }
  if (!tierMeets(tier, "executive")) {
    return {
      ...r,
      dimensions: r.dimensions.map((d) => ({ ...d, notes: [], evidence: "" })),
      probes: {
        origin: r.probes.origin as string,
        openApiStatus: r.probes.openApiStatus as number | undefined,
        mcpReachable: r.probes.mcpReachable as boolean | undefined,
      },
    };
  }
  return r;
}

function filterHeaders(
  report: SecurityScanReport,
  tier: ScanAccessTier,
): SecurityScanReport["breakdown"]["headers"] {
  const h = report.breakdown.headers;
  if (!tierMeets(tier, "deluxe")) {
    return {
      ...h,
      checks: [],
      summary: { grade: h.summary.grade, present: h.summary.present, total: h.summary.total },
    };
  }
  if (!tierMeets(tier, "executive")) {
    return {
      ...h,
      checks: h.checks.map((c) => ({
        ...c,
        value: c.present ? "present" : "",
        recommendation: "",
      })),
    };
  }
  return h;
}

function filterSurface(
  report: SecurityScanReport,
  tier: ScanAccessTier,
): SecurityScanReport["breakdown"]["surface"] {
  const s = report.breakdown.surface;
  if (!tierMeets(tier, "deluxe")) {
    return { ...s, findings: [], probes: { homeStatus: s.probes.homeStatus, paths: [] } };
  }
  if (!tierMeets(tier, "executive")) {
    return {
      ...s,
      findings: s.findings.map((f) => ({ ...f, detail: "", evidence: "", remediation: "" })),
      probes: { homeStatus: s.probes.homeStatus, paths: [] },
    };
  }
  return s;
}

function filterSummary(
  report: SecurityScanReport,
  tier: ScanAccessTier,
): SecurityScanReport["summary"] {
  const s = report.summary;
  if (!tierMeets(tier, "deluxe")) {
    return {
      overallGrade: s.overallGrade,
      readinessScore: 0,
      readinessMax: s.readinessMax,
      headersGrade: "—",
      headersPresent: 0,
      headersTotal: s.headersTotal,
      discoveryFiles: 0,
      mcpReachable: false,
      surfaceGrade: s.surfaceGrade,
      surfaceFindings: s.surfaceFindings,
      surfaceBySeverity: s.surfaceBySeverity,
    };
  }
  return s;
}

function filterRecommendations(report: SecurityScanReport, tier: ScanAccessTier): string[] {
  const recs = report.recommendations;
  if (!tierMeets(tier, "deluxe")) return recs.slice(0, 1);
  if (!tierMeets(tier, "executive")) return recs.slice(0, 3);
  return recs;
}

/** Apply TCX holder tier to a full scan report (pay-per-call; tier controls depth). */
export function applyScanTierFilter(
  report: SecurityScanReport,
  accessTier: ScanAccessTier,
): SecurityScanReportTiered {
  const liveCeiling = resolveLiveCeiling();
  const effective = clampTier(accessTier, liveCeiling);
  const launched = isSoonLaunched();
  const deskModules = buildDeskModuleCatalog(effective, liveCeiling);
  const deskPhases = buildDeskPhaseGroups(deskModules);
  const moduleCounts = {
    live: deskModules.filter((m) => m.status === "live").length,
    soon: deskModules.filter((m) => m.status === "soon").length,
    locked: deskModules.filter((m) => m.status === "locked").length,
  };

  return {
    ...report,
    verdict: tierMeets(effective, "deluxe") ? buildSecurityVerdict(report) : null,
    summary: filterSummary(report, effective),
    breakdown: {
      readiness: filterReadiness(report, effective),
      headers: filterHeaders(report, effective),
      surface: filterSurface(report, effective),
    },
    recommendations: filterRecommendations(report, effective),
    disclaimer: `${report.disclaimer} ${SECURITY_DESK_LEGAL_NOTICE}`,
    access: {
      tier: effective,
      tierLabel: TIER_LABEL[effective],
      liveCeiling,
      hobbyCeiling: liveCeiling,
      tcxLaunched: launched,
      framework: DESK_FRAMEWORK_VERSION,
      upgradeHint: upgradeHintFor(effective, liveCeiling, launched),
      legalNotice: SECURITY_DESK_LEGAL_NOTICE,
      moduleCounts,
    },
    deskModules,
    deskPhases,
  };
}
