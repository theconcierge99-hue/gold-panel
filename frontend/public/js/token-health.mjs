const $ = (id) => document.getElementById(id);

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr ?? "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function renderBars(bands) {
  const el = $("tcx-bars");
  if (!el) return;
  el.innerHTML = bands
    .map(
      (b) => `<div class="tcx-bar-row" data-tier="${b.conciergeTier ?? ""}">
      <div class="tcx-bar-label">${b.label}<small>${b.range}</small></div>
      <div class="tcx-bar-track"><div class="tcx-bar-fill" style="width:${Math.max(0, Math.min(100, b.pct))}%"></div></div>
      <div class="tcx-bar-pct">${b.pct}%</div>
    </div>`,
    )
    .join("");
}

function renderTierCards(tiers) {
  const el = $("tcx-tier-cards");
  if (!el || !tiers?.tiers) return;
  el.innerHTML = tiers.tiers
    .map((t) => {
      const gold = t.id === "president" ? " tcx-tier-card--gold" : "";
      return `<article class="tcx-tier-card${gold}">
        <h3>${t.label}</h3>
        <div class="tcx-tier-min">≥ ${t.minHold.toLocaleString()} TCX</div>
        <p>${t.headline}</p>
      </article>`;
    })
    .join("");
}

function setWalletUi(data) {
  const status = $("tcx-wallet-status");
  const grid = $("tcx-wallet-grid");
  const benefits = $("tcx-benefits");
  const list = $("tcx-benefits-list");

  if (!data?.ok) {
    if (status) {
      status.textContent = data?.error ?? "Lookup failed";
      status.className = "tcx-wallet-status warn";
    }
    if (grid) grid.hidden = true;
    if (benefits) benefits.hidden = true;
    return;
  }

  if (status) {
    status.textContent = data.message ?? "Lookup complete";
    status.className = `tcx-wallet-status ${data.tier ? "ok" : ""}`;
  }
  if (grid) grid.hidden = false;

  const bal = $("tcx-w-balance");
  const band = $("tcx-w-band");
  const tier = $("tcx-w-tier");
  if (bal) bal.textContent = data.balanceFormatted ?? (data.launched ? "0" : "Pre-T0");
  if (band) band.textContent = data.band?.label ?? "—";
  if (tier) tier.textContent = data.tier?.label ?? "Below Deluxe";

  if (data.benefits?.length && benefits && list) {
    benefits.hidden = false;
    list.innerHTML = data.benefits
      .map((b) => {
        const phase = b.status === "phased" && b.phase ? `<span class="tcx-benefit-phase">${b.phase}</span>` : "";
        return `<li><strong>${b.label}</strong> — ${b.detail}${phase}</li>`;
      })
      .join("");
  } else if (benefits && list) {
    benefits.hidden = true;
    list.innerHTML = "";
  }
}

export async function lookupWallet(wallet) {
  const status = $("tcx-wallet-status");
  if (status) {
    status.textContent = `Checking ${shortAddr(wallet)}…`;
    status.className = "tcx-wallet-status";
  }

  const res = await fetch(`/api/tcx-holder?wallet=${encodeURIComponent(wallet)}`, {
    headers: { Accept: "application/json" },
  });
  const data = await res.json();
  setWalletUi(data);
  return data;
}

async function connectPhantom() {
  const provider = window.phantom?.solana;
  if (!provider?.isPhantom) {
    window.open("https://phantom.app/", "_blank", "noopener,noreferrer");
    const status = $("tcx-wallet-status");
    if (status) {
      status.textContent = "Install Phantom, then connect again.";
      status.className = "tcx-wallet-status warn";
    }
    return null;
  }
  const { publicKey } = await provider.connect();
  return publicKey?.toString?.() ?? String(publicKey);
}

function paintHealth(data) {
  const phaseLabel = $("tcx-phase-label");
  const mintPill = $("tcx-mint-pill");

  if (phaseLabel) {
    phaseLabel.textContent = data.launched ? "TCX live" : "Pre-T0 · Pump.fun fair launch";
  }
  if (mintPill) {
    mintPill.hidden = true;
  }

  const meta = $("tcx-snapshot-meta");
  const note = $("tcx-snapshot-note");
  if (meta) {
    meta.textContent = data.snapshotDate ? `Snapshot ${data.snapshotDate}` : "—";
    if (data.stats?.circulatingSupply) meta.textContent += ` · ${data.stats.circulatingSupply} TCX`;
  }
  if (note) note.textContent = data.snapshotNote ?? "";

  renderBars(data.distribution ?? []);
  renderTierCards(data.holderTiers);
}

const FALLBACK_BANDS = [
  { id: "shrimp", label: "Shrimp", range: "< 10K TCX", pct: 42, conciergeTier: null },
  { id: "crab", label: "Crab", range: "10K – 50K", pct: 28, conciergeTier: null },
  { id: "fish", label: "Fish · Deluxe", range: "50K – 250K", pct: 18, conciergeTier: "deluxe" },
  { id: "dolphin", label: "Dolphin · Executive", range: "250K – 1M", pct: 8, conciergeTier: "executive" },
  { id: "whale", label: "Whale · President", range: "≥ 1M TCX", pct: 4, conciergeTier: "president" },
];

let connectBound = false;

/**
 * @param {{ getConnectedWallet?: () => string | null | Promise<string | null> }} [options]
 */
export function initTokenHealth(options = {}) {
  const getConnectedWallet = options.getConnectedWallet;

  if (!connectBound && $("tcx-connect-btn")) {
    connectBound = true;
    $("tcx-connect-btn").addEventListener("click", async () => {
      try {
        let wallet = null;
        if (typeof getConnectedWallet === "function") {
          wallet = await getConnectedWallet();
        }
        if (!wallet) wallet = await connectPhantom();
        if (wallet) await lookupWallet(wallet);
      } catch (e) {
        const status = $("tcx-wallet-status");
        if (status) {
          status.textContent = e instanceof Error ? e.message : "Wallet connect failed";
          status.className = "tcx-wallet-status warn";
        }
      }
    });
  }

  return loadHealth();
}

export async function loadHealth() {
  try {
    const res = await fetch("/api/tcx-health", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("health unavailable");
    const data = await res.json();
    paintHealth(data);
    return data;
  } catch {
    const phaseLabel = $("tcx-phase-label");
    if (phaseLabel) phaseLabel.textContent = "Pre-T0 · offline snapshot";
    renderBars(FALLBACK_BANDS);
    return null;
  }
}

if (typeof window !== "undefined") {
  window.__tcxLookupWallet = lookupWallet;
}

if (document.body?.classList.contains("tcx-health-page")) {
  initTokenHealth();
}

if (document.getElementById("view-token-research")) {
  window.__initLoungeTokenResearch = initTokenHealth;
}
