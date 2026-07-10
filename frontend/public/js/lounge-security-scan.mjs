const $ = (id) => document.getElementById(id);

const SELF_AUDIT_TARGET = "https://conc-exe.xyz";
const SELF_AUDIT_ALLOWLIST = ["*.conc-exe.xyz", "conc-exe.xyz", "www.conc-exe.xyz"];
const SCAN_STORAGE_KEY = "el-security-scan-last";

function selfAuditBody(target) {
  return {
    target,
    allowlist: SELF_AUDIT_ALLOWLIST,
    authorized: true,
    selfAudit: true,
  };
}

function normalizeTargetInput(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  try {
    const url = t.startsWith("http") ? new URL(t) : new URL(`https://${t}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function allowlistFromTarget(raw) {
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    const parts = host.split(".");
    if (parts.length >= 2) {
      const root = parts.slice(-2).join(".");
      return [`*.${root}`, host];
    }
    return [host];
  } catch {
    return [];
  }
}

function formatSeverityBrief(sev) {
  if (!sev) return "0";
  const parts = [];
  if (sev.high) parts.push(`${sev.high} high`);
  if (sev.medium) parts.push(`${sev.medium} med`);
  if (sev.low) parts.push(`${sev.low} low`);
  if (sev.info) parts.push(`${sev.info} info`);
  return parts.length ? parts.join(" · ") : "0";
}

function gradeClass(grade) {
  const g = String(grade ?? "").toUpperCase();
  if (g === "A" || g === "strong") return "ok";
  if (g === "B" || g === "moderate") return "mid";
  if (g === "C" || g === "D" || g === "weak") return "warn";
  return "bad";
}

function verdictClass(signal) {
  const s = String(signal ?? "").toLowerCase();
  if (s === "acceptable") return "ok";
  if (s === "watch") return "mid";
  if (s === "harden") return "warn";
  if (s === "remediate") return "warn";
  if (s === "critical") return "bad";
  return "mid";
}

function tierMeetsDeluxe(tier) {
  return tier === "deluxe" || tier === "executive" || tier === "president";
}

function compactScanForConcierge(data) {
  if (!data?.target?.hostname || !data?.summary) return null;
  if (data.verdict && !data.breakdown) {
    if (!data.verdict?.signal) return null;
    if (data.access?.tier && !tierMeetsDeluxe(data.access.tier)) return null;
    return data;
  }
  const tier = data.access?.tier ?? "guest";
  if (!tierMeetsDeluxe(tier) || !data.verdict?.signal) return null;
  return {
    target: data.target,
    auditedAt: data.auditedAt,
    summary: data.summary,
    recommendations: (data.recommendations ?? []).slice(0, 12),
    verdict: data.verdict,
    topFindings: (data.breakdown?.surface?.findings ?? []).slice(0, 8).map((f) => ({
      severity: f.severity,
      title: f.title,
      category: f.category,
    })),
    readinessHighlights: (data.breakdown?.readiness?.dimensions ?? []).slice(0, 8).map((d) => ({
      name: d.name,
      label: d.label,
      score: d.score,
    })),
    missingHeaders: (data.breakdown?.headers?.checks ?? [])
      .filter((c) => !c.present)
      .map((c) => c.header)
      .slice(0, 12),
  };
}

export function getLastSecurityScan() {
  if (typeof window !== "undefined" && window.__lastSecurityScan) return window.__lastSecurityScan;
  try {
    const raw = sessionStorage.getItem(SCAN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistScan(data) {
  const compact = compactScanForConcierge(data);
  if (!compact) {
    delete window.__lastSecurityScan;
    try {
      sessionStorage.removeItem(SCAN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  window.__lastSecurityScan = compact;
  try {
    sessionStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(compact));
  } catch {
    /* quota */
  }
}

function revealResultsPanels() {
  const root = $("sec-scan-results");
  if (!root) return;
  root.querySelectorAll(".el-reveal").forEach((el) => el.classList.add("is-visible"));
}

function escapeHtml(s) {
  return String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderAccess(data) {
  const el = $("sec-scan-access");
  if (!el || !data?.access) return;
  const a = data.access;
  const counts = a.moduleCounts;
  el.hidden = false;
  el.innerHTML = `<div class="sec-scan-access-row">
      <span class="sec-scan-access-kicker">Tier</span>
      <strong>${escapeHtml(a.tierLabel)}</strong>
      ${counts ? `<span class="sec-scan-access-meta">${counts.live} live · ${counts.soon} soon</span>` : ""}
    </div>`;
}

function renderDeskModules(data) {
  const panel = $("sec-scan-modules-panel");
  const el = $("sec-scan-modules");
  const phases = data?.deskPhases ?? [];
  if (!el || !phases.length) return;
  if (panel) panel.hidden = false;

  const renderCard = (m) => {
    const badge = m.status === "live" ? "live" : "soon";
    const label = badge === "live" ? "Live" : "Soon";
    return `<article class="sec-scan-module sec-scan-module--${badge}">
      <div class="sec-scan-module-top">
        <h4>${escapeHtml(m.title)}</h4>
        <span class="sec-scan-module-badge sec-scan-module-badge--${badge}">${label}</span>
      </div>
      <p>${escapeHtml(m.subtitle)}</p>
    </article>`;
  };

  el.innerHTML = phases
    .map(
      (phase) => `<section class="sec-scan-phase">
        <h4 class="sec-scan-phase-title">${escapeHtml(phase.label)}</h4>
        <div class="sec-scan-module-grid">${phase.modules.map(renderCard).join("")}</div>
      </section>`,
    )
    .join("");
}

function lockedPanelHtml(message) {
  return `<p class="sec-scan-locked-note">${escapeHtml(message)}</p>`;
}

function renderSummary(data) {
  const el = $("sec-scan-summary");
  if (!el || !data?.summary) return;
  const s = data.summary;
  const tier = data.access?.tier ?? "guest";
  const deluxe = tier !== "guest";
  el.innerHTML = `
    <div class="sec-scan-grade-row">
      <div class="sec-scan-grade sec-scan-grade--${gradeClass(s.overallGrade)}" aria-label="Overall grade ${s.overallGrade}">
        <span class="sec-scan-grade-label">Grade</span>
        <strong>${escapeHtml(s.overallGrade)}</strong>
      </div>
      <div class="sec-scan-stat-grid ${deluxe ? "sec-scan-stat-grid--5" : ""}">
        ${deluxe ? `<div class="sec-scan-stat"><span>Readiness</span><strong>${s.readinessScore}/${s.readinessMax}</strong></div>` : ""}
        ${deluxe ? `<div class="sec-scan-stat"><span>Headers</span><strong>${s.headersPresent}/${s.headersTotal}</strong></div>` : ""}
        <div class="sec-scan-stat"><span>Surface</span><strong>${escapeHtml(s.surfaceGrade ?? "—")} · ${s.surfaceFindings ?? 0}</strong></div>
        ${deluxe ? `<div class="sec-scan-stat"><span>Discovery</span><strong>${s.discoveryFiles}</strong></div>` : ""}
        ${deluxe ? `<div class="sec-scan-stat"><span>MCP</span><strong>${s.mcpReachable ? "Yes" : "No"}</strong></div>` : `<div class="sec-scan-stat"><span>Severity</span><strong>${escapeHtml(formatSeverityBrief(s.surfaceBySeverity))}</strong></div>`}
      </div>
    </div>`;
}

function shortDimLabel(label) {
  const map = {
    exemplary: "Strong",
    present: "Present",
    partial: "Partial",
    absent: "Absent",
    unknown: "—",
  };
  const key = String(label ?? "").toLowerCase();
  return map[key] ?? String(label ?? "").replace(/^./, (c) => c.toUpperCase());
}

function truncateValue(value, max = 42) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1)}…`;
}

function renderDimensions(readiness, access) {
  const el = $("sec-scan-dimensions");
  if (!el) return;
  const tier = access?.tier ?? "guest";
  if (tier === "guest" || !readiness?.dimensions?.length) {
    el.innerHTML = lockedPanelHtml("Full readiness detail requires Deluxe or higher.");
    return;
  }
  el.innerHTML = `<div class="sec-scan-dim-list">${readiness.dimensions
    .map((d) => {
      const pct = Math.round((d.score / 3) * 100);
      return `<div class="sec-scan-dim-row">
        <div class="tcx-bar-label">${escapeHtml(d.name)}<small>${escapeHtml(shortDimLabel(d.label))}</small></div>
        <div class="tcx-bar-track"><div class="tcx-bar-fill" style="width:${pct}%"></div></div>
        <span class="tcx-bar-pct">${d.score}/3</span>
      </div>`;
    })
    .join("")}</div>`;
}

function renderHeaders(headers, access) {
  const el = $("sec-scan-headers");
  if (!el) return;
  const tier = access?.tier ?? "guest";
  if (tier === "guest" || !headers?.checks?.length) {
    el.innerHTML = lockedPanelHtml("Header checklist requires Deluxe or higher.");
    return;
  }
  const showValue = tier !== "deluxe";
  el.innerHTML = `<table class="sec-scan-table sec-scan-headers-table"><thead><tr><th>Header</th><th>Status</th></tr></thead><tbody>${headers.checks
    .map((c) => {
      const status = c.present ? "ok" : "bad";
      const label = c.present ? "Present" : "Missing";
      const detail =
        showValue && c.present && c.value
          ? `<span class="sec-scan-header-val" title="${escapeHtml(c.value)}">${escapeHtml(truncateValue(c.value))}</span>`
          : "";
      return `<tr>
        <td><code>${escapeHtml(c.header)}</code></td>
        <td class="${status}">
          <span class="sec-scan-header-status">${label}</span>
          ${detail}
        </td>
      </tr>`;
    })
    .join("")}</tbody></table>`;
}

function renderSurface(surface, access) {
  const panel = $("sec-scan-surface-panel");
  const el = $("sec-scan-surface");
  if (!el) return;
  const tier = access?.tier ?? "guest";
  if (panel) panel.hidden = false;

  const sev = surface?.summary?.bySeverity ?? {};
  const sevRow = `<div class="sec-scan-sev-row" aria-label="Finding counts by severity">
      <span class="sec-scan-sev sec-scan-sev--high">${sev.high ?? 0} high</span>
      <span class="sec-scan-sev sec-scan-sev--medium">${sev.medium ?? 0} medium</span>
      <span class="sec-scan-sev sec-scan-sev--low">${sev.low ?? 0} low</span>
      <span class="sec-scan-sev sec-scan-sev--info">${sev.info ?? 0} info</span>
    </div>`;

  if (tier === "guest") {
    el.innerHTML = sevRow + lockedPanelHtml("Finding detail requires Deluxe or higher.");
    return;
  }

  const findings = surface?.findings ?? [];
  if (!findings.length) {
    el.innerHTML = `${sevRow}<p class="sec-scan-dim-note">No exposure signals detected.</p>`;
    return;
  }
  const partial = tier === "deluxe";
  el.innerHTML = `${sevRow}
    <table class="sec-scan-table sec-scan-findings-table"><thead><tr><th>Severity</th><th>Finding</th><th>Category</th></tr></thead><tbody>${findings
      .map(
        (f) =>
          `<tr><td><span class="sec-scan-sev sec-scan-sev--${f.severity}">${escapeHtml(f.severity)}</span></td><td><strong>${escapeHtml(f.title)}</strong>${!partial && f.detail ? `<br><span class="sec-scan-finding-detail">${escapeHtml(truncateValue(f.detail, 110))}</span>` : ""}</td><td>${escapeHtml(f.category)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
}

function renderRecommendations(recs) {
  const panel = $("sec-scan-recs-panel");
  const el = $("sec-scan-recs");
  if (!panel || !el) return;
  if (!recs?.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  el.innerHTML = recs.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
}

function renderSecurityVerdict(data) {
  const panel = $("sec-scan-verdict-panel");
  const el = $("sec-scan-verdict");
  const askBtn = $("sec-scan-ask-concierge");
  if (!panel || !el) return;

  panel.hidden = false;
  const tier = data?.access?.tier ?? "guest";

  if (!tierMeetsDeluxe(tier)) {
    if (askBtn) askBtn.hidden = true;
    el.innerHTML = lockedPanelHtml("Security verdict requires Deluxe tier (1M+ TCX) or higher.");
    return;
  }

  const v = data?.verdict;
  if (!v?.signal) {
    if (askBtn) askBtn.hidden = true;
    el.innerHTML = lockedPanelHtml("Verdict unavailable for this scan.");
    return;
  }

  if (askBtn) askBtn.hidden = false;
  const summary = v.summary || v.headline;
  el.innerHTML = `
    <div class="sec-scan-verdict-row">
      <div class="sec-scan-verdict-signal sec-scan-verdict-signal--${verdictClass(v.signal)}" aria-label="Security verdict ${escapeHtml(v.signal)}">
        <span class="sec-scan-verdict-kicker">Desk signal</span>
        <strong>${escapeHtml(String(v.signal).toUpperCase())}</strong>
      </div>
      <div class="sec-scan-verdict-copy">
        <p class="sec-scan-verdict-headline">${escapeHtml(summary)}</p>
      </div>
    </div>`;
}

function askConciergeAboutScan(data) {
  const tier = data?.access?.tier ?? "guest";
  if (!tierMeetsDeluxe(tier) || !data?.verdict?.signal) {
    toast("Security verdict requires Deluxe tier or higher");
    return;
  }
  const host = data?.target?.hostname ?? "this site";
  const grade = data?.summary?.overallGrade ?? "—";
  const signal = data?.verdict?.signal ?? "watch";
  const prompt = `Explain the Security Scan verdict for ${host} (grade ${grade}, signal ${signal}). Summarize the biggest risks, priority fixes, and whether this posture is acceptable for production agents/APIs.`;
  persistScan(data);
  if (typeof window.askConciergeFromSecurityScan === "function") {
    window.askConciergeFromSecurityScan(prompt);
    return;
  }
  if (typeof window.showView === "function") {
    window.showView("concierge");
    const inp = document.getElementById("chatInput");
    if (inp) {
      inp.value = prompt;
      inp.focus();
    }
  }
}

function setScopeStatus(msg, kind) {
  const el = $("sec-scan-scope-status");
  if (!el) return;
  el.textContent = msg;
  el.className = `sec-scan-scope-status ${kind ?? ""}`;
  el.hidden = !msg;
}

function setLoading(on) {
  const btn = $("sec-scan-run-btn");
  const self = $("sec-scan-self-btn");
  if (btn) {
    btn.disabled = on;
    btn.textContent = on ? "Scanning…" : "Run scan · $0.10";
  }
  if (self) self.disabled = on;
}

let _secScanReady = false;

function scanHeaders(getSoonHolderWallet) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const wallet = typeof getSoonHolderWallet === "function" ? getSoonHolderWallet() : null;
  if (wallet) headers["X-Soon-Holder-Wallet"] = wallet;
  return headers;
}

function renderScanResults(data) {
  persistScan(data);
  renderAccess(data);
  renderDeskModules(data);
  renderSummary(data);
  renderSecurityVerdict(data);
  renderDimensions(data.breakdown?.readiness, data.access);
  renderHeaders(data.breakdown?.headers, data.access);
  renderSurface(data.breakdown?.surface, data.access);
  renderRecommendations(data.recommendations);
}

export async function initLoungeSecurityScan(ctx = {}) {
  const paidApiFetch = ctx.paidApiFetch;
  const getSoonHolderWallet = ctx.getSoonHolderWallet;
  const toast = ctx.toast ?? ((m) => console.log(m));
  const input = $("sec-scan-url");
  const scopeBtn = $("sec-scan-scope-btn");
  const selfBtn = $("sec-scan-self-btn");
  const runBtn = $("sec-scan-run-btn");
  const results = $("sec-scan-results");

  if (!input || !runBtn) return;
  if (_secScanReady) return;
  _secScanReady = true;

  document
    .querySelectorAll("#view-security-scan .section-h.el-reveal, #view-security-scan .sec-scan-input-panel.el-reveal")
    .forEach((el) => el.classList.add("is-visible"));

  async function checkScope() {
    const origin = normalizeTargetInput(input.value);
    if (!origin) {
      setScopeStatus("Enter a valid https URL", "bad");
      return false;
    }
    setScopeStatus("Validating scope…", "");
    try {
      const res = await fetch("/api/concierge-security-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ target: origin, allowlist: allowlistFromTarget(input.value.trim()) }),
      });
      const data = await res.json();
      if (res.status === 403) {
        setScopeStatus("This URL is not in an authorized audit scope", "bad");
        return false;
      }
      if (!res.ok || !data.ok) {
        setScopeStatus(data.error ?? data.notes?.[0] ?? "Scope validation failed", "bad");
        return false;
      }
      setScopeStatus(`Ready · ${data.target.hostname}`, "ok");
      return true;
    } catch (e) {
      setScopeStatus(e?.message ?? "Scope check failed", "bad");
      return false;
    }
  }

  scopeBtn?.addEventListener("click", () => void checkScope());

  const askBtn = $("sec-scan-ask-concierge");
  askBtn?.addEventListener("click", () => {
    const scan = window.__lastSecurityScan ?? getLastSecurityScan();
    if (!scan) {
      toast("Run a scan first");
      return;
    }
    askConciergeAboutScan(scan);
  });

  selfBtn?.addEventListener("click", async () => {
    input.value = SELF_AUDIT_TARGET;
    setLoading(true);
    if (results) results.hidden = true;
    try {
      const res = await fetch("/api/concierge-security-scan", {
        method: "POST",
        headers: scanHeaders(getSoonHolderWallet),
        body: JSON.stringify(selfAuditBody(SELF_AUDIT_TARGET)),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Self-audit failed");
        return;
      }
      setScopeStatus("Concierge self-audit", "ok");
      renderScanResults(data);
      if (results) results.hidden = false;
      revealResultsPanels();
      toast("Scan complete");
    } catch (e) {
      toast(e?.message ?? "Self-audit failed");
    } finally {
      setLoading(false);
    }
  });

  runBtn.addEventListener("click", async () => {
    const raw = input.value.trim();
    const origin = normalizeTargetInput(raw);
    if (!origin) {
      toast("Enter a valid website URL");
      return;
    }
    if (typeof paidApiFetch !== "function") {
      toast("Payment module not ready — refresh the page");
      return;
    }

    const scoped = await checkScope();
    if (!scoped) return;

    setLoading(true);
    if (results) results.hidden = true;

    try {
      const res = await paidApiFetch("/api/concierge-security-scan", {
        method: "POST",
        headers: scanHeaders(getSoonHolderWallet),
        body: JSON.stringify({
          target: origin,
          allowlist: allowlistFromTarget(raw),
          authorized: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Scan failed");
        return;
      }
      renderScanResults(data);
      if (results) results.hidden = false;
      revealResultsPanels();
      toast("Scan complete");
    } catch (e) {
      if (e?.message === "Payment cancelled") return;
      toast(e?.message ?? "Scan failed");
    } finally {
      setLoading(false);
    }
  });
}

if (typeof window !== "undefined") {
  window.__initLoungeSecurityScan = initLoungeSecurityScan;
  window.__getLastSecurityScan = getLastSecurityScan;
}
