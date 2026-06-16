import { renderAgentTopNav } from "./agent-nav.mjs";

renderAgentTopNav("token-pay");

const merchantSel = document.getElementById("tp-merchant");
const daysSel = document.getElementById("tp-days");
const refreshBtn = document.getElementById("tp-refresh");
const statusEl = document.getElementById("tp-status");
const gridEl = document.getElementById("tp-grid");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function shortTx(tx) {
  if (!tx) return "—";
  return `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

function formatAtomic(atomic, symbol, decimals = 6) {
  try {
    const n = BigInt(atomic);
    const div = 10n ** BigInt(decimals);
    const whole = n / div;
    return `${whole.toLocaleString("en-US")} ${symbol}`;
  } catch {
    return `${atomic} ${symbol}`;
  }
}

async function loadMerchants() {
  const res = await fetch("/api/token-pay", { headers: { Accept: "application/json" } });
  const data = await res.json();
  const merchants = data.merchants ?? [];
  merchantSel.innerHTML = merchants
    .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.symbol)} (${escapeHtml(m.id)})</option>`)
    .join("");
  const params = new URLSearchParams(location.search);
  const q = params.get("merchant");
  if (q && merchants.some((m) => m.id === q)) merchantSel.value = q;
  else if (data.defaultMerchantId) merchantSel.value = data.defaultMerchantId;
}

function renderChart(daily) {
  const chart = document.getElementById("tp-chart");
  if (!chart) return;
  const max = Math.max(1, ...daily.map((d) => d.txCount));
  chart.innerHTML = daily
    .map((d) => {
      const h = Math.max(4, Math.round((d.txCount / max) * 120));
      const label = d.date.slice(5);
      return `<div class="tp-bar-col" title="${escapeHtml(d.date)}: ${d.txCount} tx">
        <span class="tp-bar-val">${d.txCount}</span>
        <div class="tp-bar" style="height:${h}px"></div>
        <span class="tp-bar-label">${escapeHtml(label)}</span>
      </div>`;
    })
    .join("");
}

function renderVerify(readiness, analytics) {
  const el = document.getElementById("tp-verify");
  if (!el) return;
  const items = [
    { ok: readiness?.checks?.registered, text: "Merchant registered in TOKEN_PAY_MERCHANTS_JSON" },
    { ok: readiness?.checks?.mintConfigured, text: "Mint configured" },
    { ok: readiness?.checks?.payToConfigured, text: "payTo wallet configured" },
    { ok: readiness?.checks?.priceResolvable, text: "USD price resolvable (DexScreener or fallbackUsd)" },
    { ok: readiness?.checks?.merchantTokenAta !== false, text: "Merchant token ATA ready" },
    { ok: readiness?.acceptReady, text: "Appears in 402 accepts (acceptReady)" },
    { ok: (analytics?.txCount ?? 0) > 0, text: "At least one successful Token Pay settlement recorded" },
  ];
  el.innerHTML = items
    .map((i) => `<li class="${i.ok ? "done" : ""}">${escapeHtml(i.text)}</li>`)
    .join("");
}

function renderReadiness(readiness) {
  const el = document.getElementById("tp-readiness");
  if (!el || !readiness) return;
  const cls = readiness.acceptReady ? "ready" : "pending";
  const blockers =
    readiness.blockers?.length ?
      `<ul class="tp-blockers">${readiness.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
    : "";
  el.innerHTML = `
    <h3>Readiness</h3>
    <div class="tp-readiness-row">
      <span class="tp-badge ${cls}">${escapeHtml(readiness.status)}</span>
      <span>${escapeHtml(readiness.statusLabel)}</span>
    </div>
    ${blockers}`;
}

function renderRecent(recent, symbol, solscanTx) {
  const tbody = document.getElementById("tp-recent");
  if (!tbody) return;
  if (!recent?.length) {
    tbody.innerHTML = `<tr><td colspan="4">No settlements yet — run a test payment, then check Solscan.</td></tr>`;
    return;
  }
  tbody.innerHTML = recent
    .map((r) => {
      const url = `${solscanTx}${encodeURIComponent(r.tx)}`;
      return `<tr>
        <td>${escapeHtml(fmtTime(r.at))}</td>
        <td>${escapeHtml(formatAtomic(r.amountAtomic, r.symbol || symbol))}</td>
        <td><code>${escapeHtml(r.resourceKind)}</code></td>
        <td><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(shortTx(r.tx))}</a></td>
      </tr>`;
    })
    .join("");
}

async function loadDashboard() {
  const merchantId = merchantSel?.value;
  const days = daysSel?.value ?? "14";
  if (!merchantId) return;

  if (statusEl) {
    statusEl.textContent = "Loading analytics…";
    statusEl.className = "tp-status";
  }
  gridEl?.setAttribute("hidden", "hidden");

  try {
    const res = await fetch(
      `/api/token-pay-analytics?merchant=${encodeURIComponent(merchantId)}&days=${encodeURIComponent(days)}`,
      { headers: { Accept: "application/json" } },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const a = data.analytics;
    const readiness = data.readiness;
    const solscanTx = data.links?.solscanTx ?? "https://solscan.io/tx/";

    renderReadiness(readiness);
    document.getElementById("tp-tx-count").textContent = String(a?.txCount ?? 0);
    document.getElementById("tp-volume").textContent = a?.volumeLabel ?? "0";
    document.getElementById("tp-last").textContent = a?.lastTxAt ? fmtTime(a.lastTxAt) : "—";

    const lastLink = document.getElementById("tp-last-link");
    if (lastLink) {
      lastLink.innerHTML = a?.lastTx
        ? `<a href="${escapeHtml(solscanTx + a.lastTx)}" target="_blank" rel="noopener">Solscan ${escapeHtml(shortTx(a.lastTx))}</a>`
        : "Complete a test payment to populate";
    }

    renderChart(a?.daily ?? []);
    renderRecent(a?.recent ?? [], data.symbol, solscanTx);
    renderVerify(readiness, a);

    if (statusEl) {
      const kvNote = a?.kvEnabled ? "" : " · dev mode (in-memory stats)";
      statusEl.textContent = `Merchant ${merchantId} · ${readiness?.status ?? "unknown"}${kvNote}`;
      statusEl.className = `tp-status ${readiness?.acceptReady ? "ok" : "warn"}`;
    }
    gridEl?.removeAttribute("hidden");

    const url = new URL(location.href);
    url.searchParams.set("merchant", merchantId);
    history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = e?.message || String(e);
      statusEl.className = "tp-status warn";
    }
  }
}

merchantSel?.addEventListener("change", loadDashboard);
daysSel?.addEventListener("change", loadDashboard);
refreshBtn?.addEventListener("click", loadDashboard);

await loadMerchants();
await loadDashboard();
