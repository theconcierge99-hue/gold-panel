import { renderAgentTopNav } from "./agent-nav.mjs";

renderAgentTopNav("token-pay");

const form = document.getElementById("tp-onboard-form");
const stepBtns = [...document.querySelectorAll(".tp-step")];
const panels = [...document.querySelectorAll(".tp-panel")];
const prevBtn = document.getElementById("tp-prev");
const nextBtn = document.getElementById("tp-next");
const validateBtn = document.getElementById("tp-validate");
const copyJsonBtn = document.getElementById("tp-copy-json");
const copyEnvBtn = document.getElementById("tp-copy-env");
const previewStatus = document.getElementById("tp-preview-status");
const previewReadiness = document.getElementById("tp-preview-readiness");
const jsonOut = document.getElementById("tp-json-out");
const envOut = document.getElementById("tp-env-out");
const deploySteps = document.getElementById("tp-deploy-steps");
const dashLink = document.getElementById("tp-dash-link");

let currentStep = 1;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getFormRow() {
  const fd = new FormData(form);
  const resourceKinds = [];
  if (fd.get("rk_concierge")) resourceKinds.push("concierge");
  if (fd.get("rk_external")) resourceKinds.push("external");
  if (!resourceKinds.length) resourceKinds.push("external");

  const originsRaw = String(fd.get("allowedOrigins") ?? "").trim();
  const allowedOrigins = originsRaw
    ? originsRaw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
    : undefined;

  const fallbackStr = String(fd.get("fallbackUsd") ?? "").trim();
  const fallbackUsd = fallbackStr ? Number(fallbackStr) : undefined;

  const row = {
    id: String(fd.get("id") ?? "").trim().toLowerCase(),
    symbol: String(fd.get("symbol") ?? "").trim(),
    name: String(fd.get("name") ?? "").trim() || undefined,
    mint: String(fd.get("mint") ?? "").trim(),
    decimals: Number(fd.get("decimals") ?? 6),
    payTo: String(fd.get("payTo") ?? "").trim(),
    priceSource: String(fd.get("priceSource") ?? "dexscreener"),
    resourceKinds,
  };

  if (fallbackUsd != null && !Number.isNaN(fallbackUsd) && fallbackUsd > 0) {
    row.fallbackUsd = fallbackUsd;
  }
  if (allowedOrigins?.length) row.allowedOrigins = allowedOrigins;

  return row;
}

function getResourceKind() {
  const fd = new FormData(form);
  return fd.get("rk_external") ? "external" : "concierge";
}

function getApiUrl() {
  return String(new FormData(form).get("apiUrl") ?? "").trim();
}

function buildEnvSnippet(row) {
  const arr = JSON.stringify([row]);
  return `TOKEN_PAY_MERCHANTS_JSON=${arr}`;
}

function syncOutputs() {
  const row = getFormRow();
  const compact = { ...row };
  if (!compact.name) delete compact.name;
  jsonOut.value = JSON.stringify([compact], null, 2);
  envOut.value = buildEnvSnippet(compact);
  if (dashLink && row.id) {
    dashLink.href = `/agent/token-pay?merchant=${encodeURIComponent(row.id)}`;
  }
}

function showStep(n) {
  currentStep = n;
  stepBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.step) === n));
  panels.forEach((p) => {
    if (Number(p.dataset.panel) === n) p.removeAttribute("hidden");
    else p.setAttribute("hidden", "hidden");
  });
  prevBtn.disabled = n <= 1;
  nextBtn.textContent = n >= 4 ? "Finish" : "Next";
  if (n === 4) syncOutputs();
}

function renderReadiness(data) {
  const r = data.merchant?.readiness;
  if (!r) return;
  const cls = r.acceptReady ? "ready" : "pending";
  const blockers =
    r.blockers?.length ?
      `<ul class="tp-blockers">${r.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
    : "";
  previewReadiness.innerHTML = `
    <h3>Readiness preview</h3>
    <div class="tp-readiness-row">
      <span class="tp-badge ${cls}">${escapeHtml(r.status)}</span>
      <span>${escapeHtml(r.statusLabel)}</span>
    </div>
    ${data.merchant?.conciergeLabel ? `<p class="tp-stat-sub">Sample price: <strong>${escapeHtml(data.merchant.conciergeLabel)}</strong> per 0.1 USDC call</p>` : ""}
    ${blockers}`;
  previewReadiness.removeAttribute("hidden");
}

function renderDeploySteps(steps) {
  if (!deploySteps) return;
  deploySteps.innerHTML = (steps ?? [])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
}

async function validateConfig() {
  syncOutputs();
  const row = getFormRow();
  const resourceKind = getResourceKind();

  previewStatus.removeAttribute("hidden");
  previewStatus.textContent = "Validating via Concierge preview API…";
  previewStatus.className = "tp-status";
  previewReadiness?.setAttribute("hidden", "hidden");

  try {
    const res = await fetch("/api/token-pay-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ merchant: row, resourceKind }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data.envSnippet) envOut.value = data.envSnippet;
    renderDeploySteps(data.deploySteps);

    const msgs = [];
    if (data.errors?.length) msgs.push(...data.errors.map((e) => `Error: ${e}`));
    if (data.warnings?.length) msgs.push(...data.warnings);

    if (data.merchant?.readiness?.acceptReady) {
      previewStatus.textContent = `Ready — ${data.merchant.symbol} will appear in 402 accepts for ${resourceKind}`;
      previewStatus.className = "tp-status ok";
    } else if (data.errors?.length) {
      previewStatus.textContent = data.errors.join(" · ");
      previewStatus.className = "tp-status warn";
    } else {
      previewStatus.textContent = msgs.join(" · ") || data.merchant?.readiness?.statusLabel || "Validation complete";
      previewStatus.className = `tp-status ${data.merchant?.readiness?.acceptReady ? "ok" : "warn"}`;
    }

    if (data.merchant) renderReadiness(data);

    if (resourceKind === "external" && isValidApiUrl(getApiUrl()) && data.merchant?.readiness?.acceptReady) {
      const probe = await fetch(
        `/api/token-pay-build-accept?merchant=${encodeURIComponent(row.id)}&usd=0.1&resourceUrl=${encodeURIComponent(getApiUrl())}`,
        { headers: { Accept: "application/json" } },
      );
      if (probe.status === 404) {
        previewStatus.textContent += " · build-accept will work after deploy";
      }
    }
  } catch (e) {
    previewStatus.textContent = e?.message || String(e);
    previewStatus.className = "tp-status warn";
  }
}

function isValidApiUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = prev; }, 1500);
  } catch {
    /* fallback ignored */
  }
}

stepBtns.forEach((b) => {
  b.addEventListener("click", () => showStep(Number(b.dataset.step)));
});

prevBtn?.addEventListener("click", () => showStep(Math.max(1, currentStep - 1)));
nextBtn?.addEventListener("click", () => {
  if (currentStep >= 4) {
    validateConfig();
    return;
  }
  showStep(currentStep + 1);
});

form?.addEventListener("input", () => {
  if (currentStep === 4) syncOutputs();
});

validateBtn?.addEventListener("click", validateConfig);
copyJsonBtn?.addEventListener("click", () => {
  syncOutputs();
  copyText(jsonOut.value, copyJsonBtn);
});
copyEnvBtn?.addEventListener("click", () => {
  syncOutputs();
  copyText(envOut.value, copyEnvBtn);
});

const params = new URLSearchParams(location.search);
const prefill = {
  id: params.get("id"),
  symbol: params.get("symbol"),
  mint: params.get("mint"),
};
for (const [name, val] of Object.entries(prefill)) {
  if (val && form.elements[name]) form.elements[name].value = val;
}

showStep(1);
syncOutputs();
