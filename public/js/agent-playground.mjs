import {
  CONCIERGE_AGENT_ENDPOINTS,
  CONCIERGE_AGENT_ORIGIN,
  endpointUrl,
} from "./concierge-agent-endpoints.mjs";

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
const clearBtn = document.getElementById("play-clear");
const footOrigin = document.getElementById("pg-foot-origin");
const themeBtn = document.getElementById("pg-theme-toggle");

const SEGMENT_LABELS = {
  concierge: "Concierge",
  intel: "DeFi Intel",
  lounge: "Lounge",
};

let selected = CONCIERGE_AGENT_ENDPOINTS[0];
let entryCount = 0;

function setTheme(next) {
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("el-theme", next);
}

themeBtn?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  setTheme(cur === "light" ? "dark" : "light");
});

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
  priceEl.textContent = `$${ep.priceUsd} USDC`;
  descEl.textContent = ep.description;
  urlEl.textContent = endpointUrl(ep.path);
  bodyEl.value = JSON.stringify(ep.sampleBody ?? {}, null, 2);
  execBtn.innerHTML = `Execute ${ep.method} request`;
  updateTermTitle(ep);
}

function renderPickList() {
  const bySeg = { concierge: [], intel: [], lounge: [] };
  for (const ep of CONCIERGE_AGENT_ENDPOINTS) bySeg[ep.segment].push(ep);

  pickList.innerHTML = ["concierge", "intel", "lounge"]
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
            <span class="pg-ep-price">$${ep.priceUsd}</span>
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

async function execute() {
  let body;
  try {
    body = bodyEl.value.trim() ? JSON.parse(bodyEl.value) : {};
  } catch {
    log("✗ Invalid JSON body", "err");
    return;
  }

  log(`$ curl -X ${selected.method} '${endpointUrl(selected.path)}' \\`, "dim");
  log(`    -H 'Content-Type: application/json' \\`, "dim");
  log(`    -d '${JSON.stringify(body).slice(0, 120)}${JSON.stringify(body).length > 120 ? "…" : ""}'`, "dim");
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

    log("");
    log(`HTTP ${res.status} ${res.statusText}`, res.status === 402 ? "warn" : res.ok ? "ok" : "err");

    for (const [k, v] of res.headers.entries()) {
      if (/payment/i.test(k)) {
        const preview = String(v).length > 100 ? `${String(v).slice(0, 100)}…` : String(v);
        log(`${k}: ${preview}`, "warn");
      }
    }

    if (res.status === 402) {
      log("");
      log("Expected 402 — payment is the gate.", "ok");
      log("Sign USDC on Solana or Base, then retry with PAYMENT-SIGNATURE.", "ok");
      log("Use x402 client, agent wallet, or Executive Lounge.", "dim");
    }

    log("");
    try {
      const json = JSON.parse(text);
      log(JSON.stringify(json, null, 2).slice(0, 6000));
    } catch {
      if (text) log(text.slice(0, 6000));
    }
  } catch (e) {
    log(String(e instanceof Error ? e.message : e), "err");
  } finally {
    execBtn.disabled = false;
  }
}

function clearLog() {
  logEl.innerHTML = "";
  entryCount = 0;
  updateEntryCount();
}

execBtn.addEventListener("click", execute);
clearBtn.addEventListener("click", clearLog);
updateEntryCount();
renderPickList();
