const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function fmtAge(h) {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr ?? "—";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function setStatus(el, text, kind) {
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = `trenches-status${kind ? ` trenches-status--${kind}` : ""}`;
}

function switchTab(tab) {
  document.querySelectorAll("[data-trenches-tab]").forEach((btn) => {
    const on = btn.getAttribute("data-trenches-tab") === tab;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("[data-trenches-panel]").forEach((panel) => {
    const on = panel.getAttribute("data-trenches-panel") === tab;
    panel.classList.toggle("is-active", on);
    panel.hidden = !on;
  });
}

function scoreRows(scores) {
  return [
    ["Narrative", scores?.narrativeFit],
    ["Meta heat", scores?.metaHeat],
    ["CT", scores?.ctSupport],
    ["Whales", scores?.whaleSupport],
    ["Safety", scores?.safety],
    ["Early upside", scores?.earlyUpside],
    ["Composite", scores?.composite],
  ];
}

function renderScores(scores) {
  const el = $("trenches-score-grid");
  if (!el) return;
  el.innerHTML = scoreRows(scores)
    .map(([label, val]) => {
      const n = Number(val) || 0;
      const accent = label === "Composite" ? " trenches-score--accent" : "";
      return `<div class="trenches-score${accent}">
        <span>${escapeHtml(label)}</span>
        <strong>${n}</strong>
        <div class="trenches-score-track"><div class="trenches-score-fill" style="width:${Math.max(0, Math.min(100, n))}%"></div></div>
      </div>`;
    })
    .join("");
}

function renderLinks(el, links) {
  if (!el) return;
  if (!links?.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = links
    .map(
      (l) =>
        `<a class="trenches-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`,
    )
    .join("");
}

function paintVerdict(data) {
  const results = $("trenches-desk-results");
  if (!results) return;
  results.hidden = false;

  const t = data.token ?? {};
  const sym = $("trenches-token-sym");
  const name = $("trenches-token-name");
  const meta = $("trenches-token-meta");
  if (sym) sym.textContent = t.symbol ?? "—";
  if (name) name.textContent = t.name ?? "—";
  if (meta) {
    meta.textContent = [
      shortAddr(data.address),
      data.chain,
      `mcap ${fmtUsd(t.mcapUsd)}`,
      `liq ${fmtUsd(t.liquidityUsd)}`,
      `vol ${fmtUsd(t.volume24hUsd)}`,
      `age ${fmtAge(t.pairAgeHours)}`,
    ].join(" · ");
  }

  const band = $("trenches-band");
  if (band) band.textContent = `Upside · ${data.upsideBand ?? "unknown"}`;

  const pick = $("trenches-pick");
  if (pick) pick.hidden = !data.deskPick;

  const fails = $("trenches-fails");
  if (fails) {
    if (data.hardFails?.length) {
      fails.hidden = false;
      fails.textContent = `Hard fail · ${data.hardFails.join(", ")}`;
    } else {
      fails.hidden = true;
    }
  }

  renderScores(data.scores);

  const metaNote = $("trenches-meta-note");
  if (metaNote) metaNote.textContent = data.meta?.heatNote ?? "—";
  const tags = $("trenches-meta-tags");
  if (tags) {
    tags.innerHTML = (data.meta?.tags ?? [])
      .map((t) => `<span class="trenches-tag">${escapeHtml(t)}</span>`)
      .join("");
  }
  const ctSum = $("trenches-ct-summary");
  if (ctSum) ctSum.textContent = data.ct?.summary ?? "—";
  renderLinks($("trenches-ct-links"), data.ct?.links);

  const safetyScore = $("trenches-safety-score");
  if (safetyScore) safetyScore.textContent = `Score ${data.safety?.score ?? "—"}`;
  const checks = $("trenches-safety-checks");
  if (checks) {
    checks.innerHTML = (data.safety?.checks ?? [])
      .map((c) => {
        const state =
          c.ok === true ? "ok" : c.ok === false ? "bad" : "na";
        return `<li class="trenches-check trenches-check--${state}">
          <strong>${escapeHtml(c.label)}</strong>
          <span>${escapeHtml(c.detail)}</span>
        </li>`;
      })
      .join("");
  }

  const whales = $("trenches-whales");
  if (whales) {
    whales.innerHTML = (data.whales ?? [])
      .map(
        (w) => `<li>
          <strong>${escapeHtml(w.label)}</strong>
          <span>${escapeHtml(shortAddr(w.wallet))}${w.pct != null ? ` · ${Number(w.pct).toFixed(1)}%` : ""}</span>
          <em>${escapeHtml(w.note)}</em>
        </li>`,
      )
      .join("");
  }

  const launch = $("trenches-launch-note");
  if (launch) launch.textContent = data.launchpad?.note ?? "—";

  const ext = [];
  const L = data.links ?? {};
  if (L.dexscreener) ext.push({ label: "DexScreener", url: L.dexscreener });
  if (L.pump) ext.push({ label: "Pump.fun", url: L.pump });
  if (L.gmgn) ext.push({ label: "GMGN", url: L.gmgn });
  if (L.xSearch) ext.push({ label: "X search", url: L.xSearch });
  renderLinks($("trenches-ext-links"), ext);

  const disc = $("trenches-disclaimer");
  if (disc) disc.textContent = data.disclaimer ?? "";
}

async function runDesk(ev) {
  ev?.preventDefault?.();
  const address = ($("trenches-address")?.value ?? "").trim();
  const chain = $("trenches-chain")?.value ?? "solana";
  const status = $("trenches-desk-status");
  const btn = $("trenches-run-btn");
  if (!address) {
    setStatus(status, "Paste a mint / CA first.", "warn");
    return;
  }
  if (btn) btn.disabled = true;
  setStatus(status, "Researching…");
  try {
    const qs = new URLSearchParams({ view: "desk", address, chain });
    const res = await fetch(`/api/trenches-research?${qs}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Research failed");
    paintVerdict(data);
    setStatus(status, data.note || "Lite desk report ready.", "ok");
  } catch (e) {
    setStatus(status, e instanceof Error ? e.message : "Research failed", "warn");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function paintScreen(rows) {
  const body = $("trenches-screen-body");
  if (!body) return;
  if (!rows?.length) {
    body.innerHTML = `<tr><td colspan="7" class="trenches-empty">No candidates matched filters.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const pick = r.deskPick ? `<span class="trenches-badge trenches-badge--pick">pick</span>` : "";
      return `<tr>
        <td>
          <strong>${escapeHtml(r.symbol)}</strong>
          <div class="trenches-sub">${escapeHtml(r.name)} · ${escapeHtml(shortAddr(r.address))}</div>
          <div class="trenches-tags">${(r.metaTags ?? []).map((t) => `<span class="trenches-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </td>
        <td>${fmtUsd(r.mcapUsd)}</td>
        <td>${fmtUsd(r.volume24hUsd)}</td>
        <td>${fmtAge(r.pairAgeHours)}</td>
        <td>${escapeHtml(r.upsideBand)}${pick}</td>
        <td>${r.compositePreview ?? "—"}</td>
        <td><button type="button" class="tcx-btn trenches-mini-btn" data-research-ca="${escapeHtml(r.address)}" data-research-chain="${escapeHtml(r.chain)}">Desk</button></td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("[data-research-ca]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ca = btn.getAttribute("data-research-ca");
      const chain = btn.getAttribute("data-research-chain") || "solana";
      const addrInput = $("trenches-address");
      const chainSel = $("trenches-chain");
      if (addrInput) addrInput.value = ca;
      if (chainSel) chainSel.value = chain;
      switchTab("desk");
      void runDesk();
    });
  });
}

async function runScreen(ev) {
  ev?.preventDefault?.();
  const chain = $("trenches-screen-chain")?.value ?? "solana";
  const meta = $("trenches-screen-meta")?.value ?? "";
  const status = $("trenches-screen-status");
  const btn = $("trenches-screen-btn");
  if (btn) btn.disabled = true;
  setStatus(status, "Screening…");
  try {
    const qs = new URLSearchParams({ view: "screen", chain, limit: "12" });
    if (meta) qs.set("meta", meta);
    const res = await fetch(`/api/trenches-research?${qs}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Screen failed");
    paintScreen(data.candidates ?? []);
    setStatus(
      status,
      `${(data.candidates ?? []).length} candidates · ${data.note || "lite screen"}`,
      "ok",
    );
  } catch (e) {
    setStatus(status, e instanceof Error ? e.message : "Screen failed", "warn");
  } finally {
    if (btn) btn.disabled = false;
  }
}

let bound = false;

export function initTrenchesResearch() {
  if (bound) return;
  bound = true;

  document.querySelectorAll("[data-trenches-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.getAttribute("data-trenches-tab") || "desk");
    });
  });

  $("trenches-desk-form")?.addEventListener("submit", runDesk);
  $("trenches-screen-form")?.addEventListener("submit", runScreen);
}

if (typeof window !== "undefined") {
  window.__initTrenchesResearch = initTrenchesResearch;
}

if (document.getElementById("view-token-research")) {
  initTrenchesResearch();
}
