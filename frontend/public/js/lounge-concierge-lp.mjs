/**
 * Concierge LP — Lounge session Start/Stop with wallet signatures.
 */
const STORAGE_KEY = "el-concierge-lp-session";

function $(id) {
  return document.getElementById(id);
}

function randomNonce() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function signUtf8Message(message) {
  const provider = window.phantom?.solana || window.solana || window.okxwallet?.solana;
  if (!provider?.signMessage) {
    throw new Error("Connect a Solana wallet that supports signMessage (Phantom/OKX)");
  }
  if (!provider.isConnected && typeof provider.connect === "function") {
    await provider.connect();
  }
  const encoded = new TextEncoder().encode(message);
  const out = await provider.signMessage(encoded, "utf8");
  const sig = out?.signature || out;
  const bytes = sig instanceof Uint8Array ? sig : new Uint8Array(sig);
  return bytesToBase64(bytes);
}

function readCriteria() {
  return {
    minTvl: Number($("lp-min-tvl")?.value || 50000),
    maxApy: Number($("lp-max-apy")?.value || 250),
    minOrganicScore: Number($("lp-min-organic")?.value || 0),
    takeProfitPct: Number($("lp-tp")?.value || 5),
    oorMinutes: Number($("lp-oor")?.value || 15),
    maxCapitalSol: Number($("lp-max-sol")?.value || 0.5),
  };
}

function saveLocal(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* */
  }
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function clearLocal() {
  localStorage.removeItem(STORAGE_KEY);
}

function renderSession(session, els) {
  if (!session) {
    els.active.hidden = true;
    els.idle.hidden = false;
    return;
  }
  els.idle.hidden = true;
  els.active.hidden = false;
  els.sid.textContent = session.sessionId || "—";
  els.deposit.textContent = session.depositAddress || "—";
  els.status.textContent = `${session.status || "—"}${session.dryRun ? " · paper" : " · LIVE"}`;
  els.status.className =
    "lp-status-pill " + (session.status === "active" ? "ok" : session.status === "stopped" ? "dim" : "warn");

  const top = session.lastScreen?.top || [];
  els.screen.innerHTML = top.length
    ? top
        .map(
          (p) =>
            `<div class="lp-row"><strong>${escapeHtml(p.name || "—")}</strong> · score ${p.conciergeScore ?? "—"} · APY ${p.apy ?? "—"} · TVL ${formatNum(p.tvlUsd)}</div>`,
        )
        .join("")
    : `<p class="lp-muted">Waiting for hunter screen…</p>`;

  const decisions = session.decisions || [];
  els.log.innerHTML = decisions.length
    ? decisions
        .slice(0, 20)
        .map((d) => {
          const t = d.at ? new Date(d.at).toLocaleTimeString() : "";
          return `<div class="lp-log-line"><span class="lp-log-t">${escapeHtml(t)}</span> <b>${escapeHtml(d.agent || "")}</b> ${escapeHtml(d.action || "")} — ${escapeHtml(d.reason || d.live?.note || "")}</div>`;
        })
        .join("")
    : `<p class="lp-muted">No decisions yet.</p>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export async function initLoungeConciergeLp(opts = {}) {
  const {
    paidApiFetch,
    toast = (m) => console.log(m),
    getSolWallet = () => null,
    openWalletModal = () => {},
  } = opts;

  const els = {
    idle: $("lp-idle"),
    active: $("lp-active"),
    sid: $("lp-session-id"),
    deposit: $("lp-deposit"),
    status: $("lp-session-status"),
    screen: $("lp-screen-list"),
    log: $("lp-decision-log"),
    startBtn: $("lp-start-btn"),
    stopBtn: $("lp-stop-btn"),
    copyBtn: $("lp-copy-deposit"),
    liveToggle: $("lp-live-toggle"),
  };

  let current = loadLocal();
  let pollTimer = null;

  async function refreshStatus() {
    if (!current?.sessionId) return;
    try {
      const res = await fetch(
        `/api/concierge-lp/status?sessionId=${encodeURIComponent(current.sessionId)}`,
        { headers: { Accept: "application/json" } },
      );
      const data = await res.json();
      if (res.ok && data.sessionId) {
        current = data;
        saveLocal(current);
        renderSession(current, els);
        if (current.status === "stopped") stopPoll();
      }
    } catch {
      /* */
    }
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(() => void refreshStatus(), 8000);
  }

  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  renderSession(current?.status === "active" ? current : null, els);
  if (current?.status === "active") {
    startPoll();
    void refreshStatus();
  }

  els.copyBtn?.addEventListener("click", async () => {
    const addr = els.deposit?.textContent?.trim();
    if (!addr || addr === "—") return;
    try {
      await navigator.clipboard.writeText(addr);
      toast("Deposit address copied");
    } catch {
      toast("Copy failed");
    }
  });

  els.startBtn?.addEventListener("click", async () => {
    const wallet = getSolWallet();
    if (!wallet) {
      toast("Connect Solana wallet first");
      openWalletModal();
      return;
    }
    if (typeof paidApiFetch !== "function") {
      toast("Payment module not ready — refresh");
      return;
    }

    const nonce = randomNonce();
    const exp = Math.floor(Date.now() / 1000) + 300;
    const message = `concierge-lp:v1:start:${wallet}:${nonce}:${exp}`;
    const dryRun = !els.liveToggle?.checked;

    els.startBtn.disabled = true;
    try {
      const signature = await signUtf8Message(message);
      const res = await paidApiFetch("/api/concierge-lp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          wallet,
          message,
          signature,
          nonce,
          exp,
          dryRun,
          criteria: readCriteria(),
        }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 201) {
        toast(data.error || "Failed to start Concierge LP");
        return;
      }
      current = data;
      saveLocal(current);
      renderSession(current, els);
      startPoll();
      toast(dryRun ? "Concierge LP started (paper)" : "Concierge LP started (LIVE)");
    } catch (e) {
      if (e?.message === "Payment cancelled") return;
      toast(e?.message || "Start failed");
    } finally {
      els.startBtn.disabled = false;
    }
  });

  els.stopBtn?.addEventListener("click", async () => {
    const wallet = getSolWallet();
    if (!wallet || !current?.sessionId) {
      toast("No active session");
      return;
    }
    const nonce = randomNonce();
    const exp = Math.floor(Date.now() / 1000) + 300;
    const message = `concierge-lp:v1:stop:${wallet}:${current.sessionId}:${nonce}:${exp}`;

    els.stopBtn.disabled = true;
    try {
      const signature = await signUtf8Message(message);
      const res = await fetch("/api/concierge-lp/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          wallet,
          sessionId: current.sessionId,
          message,
          signature,
          nonce,
          exp,
          closePositions: true,
          withdraw: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Stop failed");
        return;
      }
      current = data;
      saveLocal(current);
      renderSession(current, els);
      stopPoll();
      clearLocal();
      toast("Concierge LP session stopped");
      setTimeout(() => renderSession(null, els), 1500);
    } catch (e) {
      toast(e?.message || "Stop failed");
    } finally {
      els.stopBtn.disabled = false;
    }
  });
}

if (typeof window !== "undefined") {
  window.__initLoungeConciergeLp = initLoungeConciergeLp;
}
