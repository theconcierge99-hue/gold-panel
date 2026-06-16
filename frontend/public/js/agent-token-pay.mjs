import { renderAgentTopNav } from "./agent-nav.mjs";

renderAgentTopNav("token-pay");

const merchantSel = document.getElementById("tp-merchant");
const resourceSel = document.getElementById("tp-resource");
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

function resourceLabel(kind) {
  if (kind === "external") return "external (your API)";
  if (kind === "concierge") return "concierge (Concierge API)";
  return kind;
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

  const r = params.get("resource");
  if (r && resourceSel) resourceSel.value = r;
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

function renderPartnerLinks(links, merchantMeta, resourceKind) {
  const el = document.getElementById("tp-partner-links");
  if (!el || !links) return;

  const kinds = merchantMeta?.resourceKinds ?? [];
  const hasExternal = kinds.includes("external");
  const hasConcierge = kinds.includes("concierge");

  const rows = [
    { label: "Merchant config", href: links.config },
    { label: "Build accept (GET probe)", href: `${links.buildAccept}&usd=0.1` },
    { label: "Integration docs", href: links.docs },
  ];

  el.innerHTML = `
    <h3>Integration APIs</h3>
    <p class="tp-stat-sub" style="margin-bottom:12px">
      Probing readiness for <code>${escapeHtml(resourceKind)}</code>.
      Registered routes: ${kinds.length ? kinds.map((k) => `<code>${escapeHtml(k)}</code>`).join(" · ") : "—"}
      ${hasExternal ? "" : " · Add <code>external</code> to <code>resourceKinds</code> for your own API"}
    </p>
    <ul class="tp-link-list">
      ${rows
        .map(
          (r) =>
            `<li><a href="${escapeHtml(r.href)}" target="_blank" rel="noopener">${escapeHtml(r.label)}</a></li>`,
        )
        .join("")}
    </ul>
    <p class="tp-hint">Partner verify: <code>POST ${escapeHtml(links.partnerVerify || "/api/token-pay-verify")}</code> + <code>PAYMENT-SIGNATURE</code> header</p>
    ${hasExternal ? `<p class="tp-hint">Flow: build-accept → your 402 → wallet sign → token-pay-verify</p>` : ""}
    ${hasConcierge && !hasExternal ? `<p class="tp-hint">Concierge-only merchant — switch Resource to <code>concierge</code> for readiness.</p>` : ""}`;
  el.removeAttribute("hidden");
}

function renderVerify(readiness, analytics, resourceKind, merchantMeta) {
  const el = document.getElementById("tp-verify");
  if (!el) return;

  const kinds = merchantMeta?.resourceKinds ?? [];
  const hasExternal = kinds.includes("external");
  const externalSettlements = (analytics?.recent ?? []).some((r) => r.resourceKind === "external");

  const base = [
    { ok: readiness?.checks?.registered, text: "Merchant registered in TOKEN_PAY_MERCHANTS_JSON" },
    { ok: readiness?.checks?.mintConfigured, text: "Mint configured" },
    { ok: readiness?.checks?.payToConfigured, text: "payTo wallet configured" },
    { ok: readiness?.checks?.priceResolvable, text: "USD price resolvable (DexScreener or fallbackUsd)" },
    { ok: readiness?.checks?.merchantTokenAta !== false, text: "Merchant token ATA ready" },
    { ok: readiness?.checks?.supportsResource, text: `resourceKinds includes "${resourceKind}"` },
  ];

  const resourceSpecific =
    resourceKind === "external"
      ? [
          { ok: hasExternal, text: '"external" enabled for partner API gate' },
          { ok: readiness?.acceptReady, text: "build-accept ready (acceptReady for external)" },
          { ok: externalSettlements, text: "At least one external settlement recorded" },
        ]
      : [
          { ok: readiness?.acceptReady, text: "Appears in Concierge 402 accepts (acceptReady)" },
          { ok: (analytics?.txCount ?? 0) > 0, text: "At least one Token Pay settlement recorded" },
        ];

  const items = [...base, ...resourceSpecific];
  el.innerHTML = items
    .map((i) => `<li class="${i.ok ? "done" : ""}">${escapeHtml(i.text)}</li>`)
    .join("");
}

function renderReadiness(readiness, resourceKind, merchantMeta) {
  const el = document.getElementById("tp-readiness");
  if (!el || !readiness) return;
  const cls = readiness.acceptReady ? "ready" : "pending";
  const blockers =
    readiness.blockers?.length ?
      `<ul class="tp-blockers">${readiness.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
    : "";
  const kinds = merchantMeta?.resourceKinds ?? [];
  const kindTags = kinds
    .map((k) => `<span class="tp-tag">${escapeHtml(k)}</span>`)
    .join("");
  const origins =
    merchantMeta?.allowedOrigins?.length ?
      `<p class="tp-stat-sub">allowedOrigins: ${merchantMeta.allowedOrigins.map((o) => `<code>${escapeHtml(o)}</code>`).join(" ")}</p>`
    : "";

  el.innerHTML = `
    <h3>Readiness · ${escapeHtml(resourceLabel(resourceKind))}</h3>
    <div class="tp-readiness-row">
      <span class="tp-badge ${cls}">${escapeHtml(readiness.status)}</span>
      <span>${escapeHtml(readiness.statusLabel)}</span>
      ${kindTags ? `<span class="tp-kind-tags">${kindTags}</span>` : ""}
    </div>
    ${origins}
    ${blockers}`;
}

function renderRecent(recent, symbol, solscanTx) {
  const tbody = document.getElementById("tp-recent");
  if (!tbody) return;
  if (!recent?.length) {
    tbody.innerHTML = `<tr><td colspan="4">No settlements yet — run a test payment (Concierge route or partner verify), then check Solscan.</td></tr>`;
    return;
  }
  tbody.innerHTML = recent
    .map((r) => {
      const url = `${solscanTx}${encodeURIComponent(r.tx)}`;
      const route =
        r.resourceKind === "external" ? "external" : r.resourceKind || "—";
      return `<tr>
        <td>${escapeHtml(fmtTime(r.at))}</td>
        <td>${escapeHtml(formatAtomic(r.amountAtomic, r.symbol || symbol))}</td>
        <td><code>${escapeHtml(route)}</code></td>
        <td><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(shortTx(r.tx))}</a></td>
      </tr>`;
    })
    .join("");
}

async function syncResourceDefault(merchantId) {
  if (!merchantId || !resourceSel) return;
  const params = new URLSearchParams(location.search);
  if (params.get("resource")) return;
  try {
    const res = await fetch(`/api/token-pay?merchant=${encodeURIComponent(merchantId)}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const kinds = data.merchant?.resourceKinds ?? [];
    if (kinds.includes("external") && !kinds.includes("concierge")) {
      resourceSel.value = "external";
    } else if (kinds.includes("concierge")) {
      resourceSel.value = "concierge";
    }
  } catch {
    /* keep current selection */
  }
}

async function loadDashboard() {
  const merchantId = merchantSel?.value;
  const days = daysSel?.value ?? "14";
  if (!merchantId) return;

  await syncResourceDefault(merchantId);
  const resourceKind = resourceSel?.value ?? "concierge";

  if (statusEl) {
    statusEl.textContent = "Loading analytics…";
    statusEl.className = "tp-status";
  }
  gridEl?.setAttribute("hidden", "hidden");

  try {
    const res = await fetch(
      `/api/token-pay-analytics?merchant=${encodeURIComponent(merchantId)}&days=${encodeURIComponent(days)}&resource=${encodeURIComponent(resourceKind)}`,
      { headers: { Accept: "application/json" } },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const a = data.analytics;
    const readiness = data.readiness;
    const merchantMeta = data.merchant;
    const solscanTx = data.links?.solscanTx ?? "https://solscan.io/tx/";

    renderReadiness(readiness, resourceKind, merchantMeta);
    renderPartnerLinks(data.links, merchantMeta, resourceKind);
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
    renderVerify(readiness, a, resourceKind, merchantMeta);

    if (statusEl) {
      const kvNote = a?.kvEnabled ? "" : " · dev mode (in-memory stats)";
      statusEl.textContent = `Merchant ${merchantId} · ${resourceLabel(resourceKind)} · ${readiness?.status ?? "unknown"}${kvNote}`;
      statusEl.className = `tp-status ${readiness?.acceptReady ? "ok" : "warn"}`;
    }
    gridEl?.removeAttribute("hidden");

    const url = new URL(location.href);
    url.searchParams.set("merchant", merchantId);
    url.searchParams.set("resource", resourceKind);
    history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = e?.message || String(e);
      statusEl.className = "tp-status warn";
    }
  }
}

merchantSel?.addEventListener("change", loadDashboard);
resourceSel?.addEventListener("change", loadDashboard);
daysSel?.addEventListener("change", loadDashboard);
refreshBtn?.addEventListener("click", loadDashboard);

await loadMerchants();
await loadDashboard();
