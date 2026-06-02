import {
  CONCIERGE_AGENT_ENDPOINTS,
  endpointUrl,
} from "./concierge-agent-endpoints.mjs";
import "./agent-hub.mjs";

const pickList = document.getElementById("ep-pick-list");
const methodEl = document.getElementById("play-method");
const pathEl = document.getElementById("play-path");
const priceEl = document.getElementById("play-price");
const descEl = document.getElementById("play-desc");
const urlEl = document.getElementById("play-url");
const bodyEl = document.getElementById("play-body");
const termEl = document.getElementById("play-terminal");
const execBtn = document.getElementById("play-exec");
const clearBtn = document.getElementById("play-clear");

let selected = CONCIERGE_AGENT_ENDPOINTS[0];

function log(line, cls = "") {
  const span = document.createElement("div");
  if (cls) span.className = cls;
  span.textContent = line;
  termEl.appendChild(span);
  termEl.scrollTop = termEl.scrollHeight;
}

function selectEndpoint(ep) {
  selected = ep;
  pickList.querySelectorAll(".agent-ep-pick").forEach((b) => {
    b.classList.toggle("active", b.dataset.id === ep.id);
  });
  methodEl.textContent = ep.method;
  pathEl.textContent = ep.path;
  priceEl.textContent = `$${ep.priceUsd} USDC`;
  descEl.textContent = ep.description;
  urlEl.textContent = endpointUrl(ep.path);
  bodyEl.value = JSON.stringify(ep.sampleBody ?? {}, null, 2);
}

function renderPickList() {
  const bySeg = { concierge: [], intel: [], lounge: [] };
  for (const ep of CONCIERGE_AGENT_ENDPOINTS) bySeg[ep.segment].push(ep);
  pickList.innerHTML = ["concierge", "intel", "lounge"]
    .flatMap((seg) => bySeg[seg])
    .map(
      (ep) =>
        `<button type="button" class="agent-ep-pick" data-id="${ep.id}">${ep.name}<code>${ep.method} ${ep.path}</code></button>`,
    )
    .join("");
  pickList.querySelectorAll(".agent-ep-pick").forEach((btn) => {
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
    log("Invalid JSON body", "err");
    return;
  }
  log(`$ curl -X ${selected.method} ${endpointUrl(selected.path)}`, "warn");
  log(`→ Probing without PAYMENT-SIGNATURE…`);
  execBtn.disabled = true;
  try {
    const res = await fetch(endpointUrl(selected.path), {
      method: selected.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    log(`HTTP ${res.status} ${res.statusText}`, res.status === 402 ? "warn" : res.ok ? "ok" : "err");
    for (const [k, v] of res.headers.entries()) {
      if (/payment/i.test(k)) log(`${k}: ${String(v).slice(0, 120)}…`, "warn");
    }
    if (res.status === 402) {
      log("", "");
      log("Expected 402 — payment is the gate. Sign USDC and retry with PAYMENT-SIGNATURE.", "ok");
      log("Use Executive Lounge wallet, x402 client, or POST from your agent wallet.", "");
    }
    try {
      const json = JSON.parse(text);
      log(JSON.stringify(json, null, 2).slice(0, 4000));
    } catch {
      log(text.slice(0, 4000));
    }
  } catch (e) {
    log(String(e instanceof Error ? e.message : e), "err");
  } finally {
    execBtn.disabled = false;
  }
}

execBtn.addEventListener("click", execute);
clearBtn.addEventListener("click", () => {
  termEl.innerHTML = "";
  log("concierge-playground — x402 probe — select endpoint and Execute");
  log("Paid routes return HTTP 402 with PAYMENT-REQUIRED until USDC is signed.");
});

renderPickList();
clearBtn.click();
