import { renderAgentTopNav } from "./agent-nav.mjs";
import {
  CONCIERGE_AGENT_ENDPOINTS,
  CONCIERGE_AGENT_ORIGIN,
  endpointUrl,
} from "./concierge-agent-endpoints.mjs";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getWalletSession,
  paidFetchOptionsForRail,
  shortAddr,
  x402ServerPayConfigFromApi,
} from "./pg-wallet.mjs";

renderAgentTopNav("playground");

const pickList = document.getElementById("ep-pick-list");
const methodEl = document.getElementById("play-method");
const pathEl = document.getElementById("play-path");
const priceEl = document.getElementById("play-price");
const descEl = document.getElementById("play-desc");
const urlEl = document.getElementById("play-url");
const bodyEl = document.getElementById("play-body");
const logEl = document.getElementById("pg-log");
const placeholderEl = document.getElementById("pg-placeholder");
const termTitleEl = document.getElementById("pg-term-title");
const entryCountEl = document.getElementById("pg-entry-count");
const execBtn = document.getElementById("play-exec");
const copyCurlBtn = document.getElementById("play-copy-curl");
const clearBtn = document.getElementById("play-clear");
const footOrigin = document.getElementById("pg-foot-origin");
const walletStatusEl = document.getElementById("pg-wallet-status");
const walletConnectBtn = document.getElementById("pg-wallet-connect");
const payWalletBtn = document.getElementById("play-pay-wallet");
const payRailEl = document.getElementById("pg-pay-rail");

const SEGMENT_LABELS = {
  concierge: "Concierge",
  research: "Research",
  intel: "DeFi Intel",
  alpha: "Alpha Intel",
  security: "Security Desk",
  lounge: "Lounge",
};

let selected = CONCIERGE_AGENT_ENDPOINTS[0];
let entryCount = 0;
let x402ConfigCache = null;

function isPaidEndpoint(ep) {
  return ep.priceUsd !== "0" && Number(ep.priceUsd) > 0;
}

function renderWalletUi() {
  if (!walletStatusEl || !walletConnectBtn || !payWalletBtn) return;
  const session = getWalletSession();
  const hasSol = !!session.sol?.address;
  const hasEvm = !!session.evm?.address;

  if (hasSol || hasEvm) {
    const parts = [];
    if (hasSol) parts.push(`SOL ${shortAddr(session.sol.address, "sol")}`);
    if (hasEvm) parts.push(`EVM ${shortAddr(session.evm.address, "evm")}`);
    walletStatusEl.textContent = parts.join(" · ");
    walletStatusEl.classList.add("ok");
    walletConnectBtn.textContent = hasSol ? "Disconnect" : "Connect Solana";
  } else {
    walletStatusEl.textContent = "Not connected — Phantom or OKX";
    walletStatusEl.classList.remove("ok");
    walletConnectBtn.textContent = "Connect";
  }

  payWalletBtn.disabled = !isPaidEndpoint(selected) || (!hasSol && !hasEvm);
}

async function loadX402Config() {
  if (x402ConfigCache) return x402ConfigCache;
  const res = await fetch("/api/x402-config", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load x402 config");
  x402ConfigCache = await res.json();
  return x402ConfigCache;
}

async function toggleWalletConnect() {
  const session = getWalletSession();
  if (session.sol?.address) {
    disconnectSolanaWallet();
    renderWalletUi();
    log("Wallet disconnected (Solana).", "dim");
    return;
  }

  walletConnectBtn.disabled = true;
  try {
    const pick = window.phantom?.solana ? "phantom" : "okx";
    await connectSolanaWallet(pick);
    renderWalletUi();
    log(`Connected Solana wallet (${pick}).`, "ok");
  } catch (e) {
    log(String(e instanceof Error ? e.message : e), "err");
  } finally {
    walletConnectBtn.disabled = false;
  }
}

function logResponse(res, text) {
  log("");
  log(`HTTP ${res.status} ${res.statusText}`, res.status === 402 ? "warn" : res.ok ? "ok" : "err");

  for (const [k, v] of res.headers.entries()) {
    if (/payment/i.test(k)) {
      const preview = String(v).length > 100 ? `${String(v).slice(0, 100)}…` : String(v);
      log(`${k}: ${preview}`, "warn");
    }
  }

  log("");
  try {
    const json = JSON.parse(text);
    log(JSON.stringify(json, null, 2).slice(0, 12000));
    return json;
  } catch {
    if (text) log(text.slice(0, 12000));
    return null;
  }
}

const origin = CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "");
const host = origin.replace(/^https?:\/\//, "");
if (footOrigin) {
  footOrigin.textContent = host;
  footOrigin.href = origin + "/";
}

function updateEntryCount() {
  entryCountEl.textContent = `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`;
  placeholderEl.classList.toggle("hidden", entryCount > 0);
}

function log(line, cls = "") {
  entryCount += 1;
  updateEntryCount();
  const span = document.createElement("div");
  if (cls) span.className = cls;
  span.textContent = line;
  logEl.appendChild(span);
  logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
}

function updateTermTitle(ep) {
  termTitleEl.textContent = `concierge-playground — production — ${ep.method} ${ep.path}`;
}

function selectEndpoint(ep) {
  selected = ep;
  pickList.querySelectorAll(".pg-ep-row").forEach((b) => {
    b.classList.toggle("active", b.dataset.id === ep.id);
  });
  methodEl.textContent = ep.method;
  pathEl.textContent = `${ep.method} ${ep.path}`;
  priceEl.textContent =
    ep.priceUsd === "0" ? "Free" : `$${ep.priceUsd} USDC`;
  void refreshPriceLabel(ep);
  descEl.textContent = ep.description;
  urlEl.textContent = endpointUrl(ep.path);
  bodyEl.value = JSON.stringify(ep.sampleBody ?? {}, null, 2);
  execBtn.innerHTML = `Execute ${ep.method} request`;
  updateTermTitle(ep);
  renderWalletUi();
}

async function refreshPriceLabel(ep = selected) {
  if (!priceEl || ep.priceUsd === "0") return;
  try {
    const cfg = await loadX402Config();
    const tcx = cfg.tokenConciergeLabel || cfg.tokenPay?.default?.conciergeLabel;
    if (tcx) priceEl.textContent = `$${ep.priceUsd} USDC or ${tcx}`;
  } catch {
    /* keep USDC-only label */
  }
}

function renderPickList() {
  const bySeg = { concierge: [], research: [], intel: [], alpha: [], security: [], lounge: [] };
  for (const ep of CONCIERGE_AGENT_ENDPOINTS) {
    if (bySeg[ep.segment]) bySeg[ep.segment].push(ep);
  }

  pickList.innerHTML = ["concierge", "research", "intel", "alpha", "security", "lounge"]
    .filter((seg) => bySeg[seg].length)
    .map(
      (seg) => `
      <div class="pg-ep-group">
        <div class="pg-ep-group-h">${SEGMENT_LABELS[seg] || seg}</div>
        ${bySeg[seg]
          .map(
            (ep) => `
          <button type="button" class="pg-ep-row" data-id="${ep.id}">
            <div class="pg-ep-line1">
              <span class="pg-ep-method">${ep.method}</span>
              <span class="pg-ep-path">${ep.path}</span>
            </div>
            <span class="pg-ep-price">${ep.priceUsd === "0" ? "Free" : `$${ep.priceUsd}`}</span>
          </button>`,
          )
          .join("")}
      </div>`,
    )
    .join("");

  pickList.querySelectorAll(".pg-ep-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ep = CONCIERGE_AGENT_ENDPOINTS.find((e) => e.id === btn.dataset.id);
      if (ep) selectEndpoint(ep);
    });
  });

  const q = new URLSearchParams(location.search).get("ep");
  const fromQ = q ? CONCIERGE_AGENT_ENDPOINTS.find((e) => e.id === q) : null;
  selectEndpoint(fromQ || CONCIERGE_AGENT_ENDPOINTS[0]);
}

function parseBodyJson() {
  try {
    return bodyEl.value.trim() ? JSON.parse(bodyEl.value) : {};
  } catch {
    return null;
  }
}

/** PowerShell-safe one-liner — curl.exe with single-quoted JSON (-d). */
function buildCurlCommand(ep, body) {
  const url = endpointUrl(ep.path);
  const json = JSON.stringify(body);
  return `curl.exe -X ${ep.method} "${url}" -H "Content-Type: application/json" -d '${json}'`;
}

function buildPayCurlCommand(ep, body) {
  const url = endpointUrl(ep.path);
  const json = JSON.stringify(body);
  return `pay curl ${url} -d '${json}'`;
}

async function copyCurlCommand() {
  const body = parseBodyJson();
  if (body === null) {
    log("✗ Invalid JSON body — fix before copying curl", "err");
    return;
  }

  const cmd = buildCurlCommand(selected, body);
  const payCmd = buildPayCurlCommand(selected, body);
  const text = `${cmd}\r\n\r\n# With pay.sh (WSL / macOS / Linux):\r\n${payCmd}`;

  try {
    await navigator.clipboard.writeText(cmd);
    if (copyCurlBtn) {
      const prev = copyCurlBtn.textContent;
      copyCurlBtn.textContent = "Copied!";
      copyCurlBtn.classList.add("is-copied");
      setTimeout(() => {
        copyCurlBtn.textContent = prev;
        copyCurlBtn.classList.remove("is-copied");
      }, 1800);
    }
    log("Copied PowerShell curl.exe one-liner to clipboard.", "ok");
    log(cmd, "dim");
    log("");
    log("pay.sh (WSL):", "dim");
    log(payCmd, "dim");
  } catch {
    log("Clipboard blocked — copy manually:", "warn");
    log(cmd, "dim");
  }
}

async function execute() {
  const body = parseBodyJson();
  if (body === null) {
    log("✗ Invalid JSON body", "err");
    return;
  }

  const curlPreview = buildCurlCommand(selected, body);
  log(`$ ${curlPreview}`, "dim");
  log("");
  log("→ Probing without PAYMENT-SIGNATURE…", "warn");

  execBtn.disabled = true;
  try {
    const res = await fetch(endpointUrl(selected.path), {
      method: selected.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();

    if (res.status === 402) {
      log("");
      log("Expected 402 — payment is the gate.", "ok");
      log("Connect wallet below and click Pay with wallet, or use pay curl.", "ok");
    }

    logResponse(res, text);
  } catch (e) {
    log(String(e instanceof Error ? e.message : e), "err");
  } finally {
    execBtn.disabled = false;
  }
}

async function executePaid() {
  const body = parseBodyJson();
  if (body === null) {
    log("✗ Invalid JSON body", "err");
    return;
  }

  if (!isPaidEndpoint(selected)) {
    log("This endpoint is free — use Execute.", "warn");
    return;
  }

  const session = getWalletSession();
  if (!session.sol?.address && !session.evm?.address) {
    log("Connect wallet first (Phantom / OKX, or login on Lounge).", "err");
    return;
  }

  if (typeof window.createX402PaidFetch !== "function") {
    log("Payment module not loaded — hard refresh (Ctrl+F5).", "err");
    return;
  }

  const rail = payRailEl?.value || "auto";
  const curlPreview = buildCurlCommand(selected, body);
  log(`$ ${curlPreview}`, "dim");
  log("");
  log(`→ Pay with wallet (${rail})…`, "warn");

  payWalletBtn.disabled = true;
  execBtn.disabled = true;
  try {
    const cfg = await loadX402Config();
    const serverCfg = x402ServerPayConfigFromApi(cfg);
    const paidFetch = await window.createX402PaidFetch(
      session,
      "mainnet",
      serverCfg,
      paidFetchOptionsForRail(rail),
    );

    const res = await paidFetch(endpointUrl(selected.path), {
      method: selected.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();

    if (res.ok) {
      log("");
      log("Paid call succeeded.", "ok");
    } else if (res.status === 402) {
      log("");
      log("Still 402 — check balance (USDC or TCX) and SOL for gas.", "warn");
    }

    logResponse(res, text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel|reject|denied/i.test(msg)) log("Payment cancelled in wallet.", "warn");
    else log(msg, "err");
  } finally {
    payWalletBtn.disabled = false;
    execBtn.disabled = false;
    renderWalletUi();
  }
}

function clearLog() {
  logEl.innerHTML = "";
  entryCount = 0;
  updateEntryCount();
}

execBtn.addEventListener("click", execute);
payWalletBtn?.addEventListener("click", executePaid);
walletConnectBtn?.addEventListener("click", toggleWalletConnect);
copyCurlBtn?.addEventListener("click", copyCurlCommand);
clearBtn.addEventListener("click", clearLog);
updateEntryCount();
renderPickList();
renderWalletUi();
