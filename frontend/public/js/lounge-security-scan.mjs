const $ = (id) => document.getElementById(id);

const SELF_AUDIT_TARGET = "https://conc-exe.xyz";
const SELF_AUDIT_ALLOWLIST = ["*.conc-exe.xyz", "conc-exe.xyz", "www.conc-exe.xyz"];

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

function gradeClass(grade) {
  const g = String(grade ?? "").toUpperCase();
  if (g === "A" || g === "strong") return "ok";
  if (g === "B" || g === "moderate") return "mid";
  if (g === "C" || g === "D" || g === "weak") return "warn";
  return "bad";
}

function renderSummary(data) {
  const el = $("sec-scan-summary");
  if (!el || !data?.summary) return;
  const s = data.summary;
  el.innerHTML = `
    <div class="sec-scan-grade sec-scan-grade--${gradeClass(s.overallGrade)}" aria-label="Overall grade ${s.overallGrade}">
      <span class="sec-scan-grade-label">Grade</span>
      <strong>${s.overallGrade}</strong>
    </div>
    <div class="sec-scan-stat-grid">
      <div class="sec-scan-stat"><span>Readiness</span><strong>${s.readinessScore}/${s.readinessMax}</strong></div>
      <div class="sec-scan-stat"><span>Headers</span><strong>${s.headersPresent}/${s.headersTotal} · ${s.headersGrade}</strong></div>
      <div class="sec-scan-stat"><span>Discovery</span><strong>${s.discoveryFiles} files</strong></div>
      <div class="sec-scan-stat"><span>MCP</span><strong>${s.mcpReachable ? "Yes" : "No"}</strong></div>
    </div>`;
}

function renderDimensions(readiness) {
  const el = $("sec-scan-dimensions");
  if (!el || !readiness?.dimensions) return;
  el.innerHTML = readiness.dimensions
    .map((d) => {
      const pct = Math.round((d.score / 3) * 100);
      return `<div class="sec-scan-dim">
        <div class="sec-scan-dim-head"><span>${d.name}</span><em>${d.label}</em></div>
        <div class="sec-scan-bar-track"><div class="sec-scan-bar-fill" style="width:${pct}%"></div></div>
        <p class="sec-scan-dim-note">${(d.notes?.[0] ?? "").replace(/</g, "&lt;")}</p>
      </div>`;
    })
    .join("");
}

function renderHeaders(headers) {
  const el = $("sec-scan-headers");
  if (!el || !headers?.checks) return;
  el.innerHTML = `<table class="sec-scan-table"><thead><tr><th>Header</th><th>Status</th></tr></thead><tbody>${headers.checks
    .map(
      (c) =>
        `<tr><td><code>${c.header}</code></td><td class="${c.present ? "ok" : "bad"}">${c.present ? "Present" : "Missing"}</td></tr>`,
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
  el.innerHTML = recs.map((r) => `<li>${String(r).replace(/</g, "&lt;")}</li>`).join("");
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
    btn.textContent = on ? "Scanning…" : "Run scan ($0.10)";
  }
  if (self) self.disabled = on;
}

export async function initLoungeSecurityScan(ctx = {}) {
  const paidApiFetch = ctx.paidApiFetch;
  const toast = ctx.toast ?? ((m) => console.log(m));
  const input = $("sec-scan-url");
  const scopeBtn = $("sec-scan-scope-btn");
  const selfBtn = $("sec-scan-self-btn");
  const runBtn = $("sec-scan-run-btn");
  const results = $("sec-scan-results");

  if (!input || !runBtn) return;

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
      setScopeStatus(`Scope OK — ${data.target.hostname}`, "ok");
      return true;
    } catch (e) {
      setScopeStatus(e?.message ?? "Scope check failed", "bad");
      return false;
    }
  }

  scopeBtn?.addEventListener("click", () => void checkScope());

  selfBtn?.addEventListener("click", async () => {
    input.value = SELF_AUDIT_TARGET;
    setLoading(true);
    if (results) results.hidden = true;
    try {
      const res = await fetch("/api/concierge-security-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(selfAuditBody(SELF_AUDIT_TARGET)),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Self-audit failed");
        return;
      }
      setScopeStatus("Self-audit — conc-exe.xyz", "ok");
      renderSummary(data);
      renderDimensions(data.breakdown?.readiness);
      renderHeaders(data.breakdown?.headers);
      renderRecommendations(data.recommendations);
      if (results) results.hidden = false;
      toast("Concierge self-audit complete");
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
        headers: { "Content-Type": "application/json", Accept: "application/json" },
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
      renderSummary(data);
      renderDimensions(data.breakdown?.readiness);
      renderHeaders(data.breakdown?.headers);
      renderRecommendations(data.recommendations);
      if (results) results.hidden = false;
      toast("Security scan complete");
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
}
