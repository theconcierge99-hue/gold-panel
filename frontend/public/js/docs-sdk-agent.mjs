/**
 * Live setup checks on /docs/sdk/agent — mirrors @conc-exe/agent Quick start via fetch.
 */
const ORIGIN = window.location.origin.replace(/\/$/, "") || "https://conc-exe.xyz";

const ROUTES = [
  { kind: "intel-macro", path: "/api/concierge-intel-macro", label: "intel-macro · $0.02", body: {} },
  { kind: "intel-tvl", path: "/api/concierge-intel-tvl", label: "intel-tvl · $0.02", body: {} },
  { kind: "intel-wire", path: "/api/concierge-intel-wire", label: "intel-wire · $0.02", body: { limit: 8 } },
  {
    kind: "intel-verdict",
    path: "/api/concierge-intel-verdict",
    label: "intel-verdict · $0.10",
    body: { message: "DeFi outlook on Solana", includeInsider: true },
  },
  {
    kind: "intel-meteora",
    path: "/api/concierge-intel-meteora",
    label: "intel-meteora · $0.10",
    body: { sortByApy: true, limit: 8 },
  },
];

const outEl = document.getElementById("sdk-out");
const kindEl = document.getElementById("sdk-kind");
const msgEl = document.getElementById("sdk-message");
const payCurlEl = document.getElementById("sdk-paycurl");
const statusEl = document.getElementById("sdk-live-status");

function selectedRoute() {
  return ROUTES.find((r) => r.kind === kindEl.value) || ROUTES[0];
}

function buildBody(route) {
  const body = { ...(route.body || {}) };
  const msg = (msgEl?.value || "").trim();
  if (msg) body.message = msg;
  return body;
}

function payCurl(route, body) {
  return `pay curl ${ORIGIN}${route.path} -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`;
}

function setStep(id, state) {
  const li = document.querySelector(`.sdk-live-steps [data-step="${id}"]`);
  if (!li) return;
  li.dataset.state = state;
  li.classList.toggle("is-ok", state === "ok");
  li.classList.toggle("is-run", state === "run");
  li.classList.toggle("is-err", state === "err");
}

function setStatus(text, tone = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function log(lines, replace = false) {
  if (!outEl) return;
  const text = Array.isArray(lines) ? lines.join("\n") : String(lines);
  outEl.textContent = replace ? text : `${outEl.textContent}${outEl.textContent ? "\n" : ""}${text}`;
  outEl.scrollTop = outEl.scrollHeight;
}

function pretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function readJson(res) {
  const text = await res.text();
  try {
    return { raw: text, json: JSON.parse(text) };
  } catch {
    return { raw: text, json: null };
  }
}

async function checkMcp() {
  setStep("mcp", "run");
  setStatus("Checking MCP…", "run");
  const res = await fetch(`${ORIGIN}/api/mcp`, { headers: { Accept: "application/json" } });
  const { json } = await readJson(res);
  if (!res.ok || !json) {
    setStep("mcp", "err");
    throw new Error(`MCP probe failed (${res.status})`);
  }
  const free = Array.isArray(json.freeTools) ? json.freeTools.join(", ") : "—";
  log([
    `$ GET ${ORIGIN}/api/mcp`,
    `← ${res.status} name=${json.name} version=${json.version} tools=${json.tools}`,
    `  freeTools: ${free}`,
    `  sdk: ${json.sdk || "@conc-exe/agent"}`,
    "",
  ]);
  setStep("mcp", "ok");
  return json;
}

async function runDiscover() {
  setStep("discover", "run");
  setStatus("Running discover()…", "run");
  const [x402, openapi, card, mesh] = await Promise.all([
    fetch(`${ORIGIN}/.well-known/x402`).then((r) => r.json()),
    fetch(`${ORIGIN}/openapi.json`).then((r) => r.json()),
    fetch(`${ORIGIN}/.well-known/agent-card.json`).then((r) => r.json()).catch(() => null),
    fetch(`${ORIGIN}/api/agent-a2a-mesh`).then((r) => r.json()).catch(() => null),
  ]);
  const resources = Array.isArray(x402.resources) ? x402.resources.length : 0;
  const paths = openapi?.paths ? Object.keys(openapi.paths).length : 0;
  log([
    `$ agent.discover()`,
    `← service: ${x402.serviceName || "Concierge Agent"}`,
    `  resourceUrls: ${resources}`,
    `  openapi paths: ${paths}`,
    `  agentCard: ${card ? "yes" : "no"}`,
    `  a2aMesh: ${mesh ? "yes" : "no"}`,
    `  mcpUrl: ${ORIGIN}/api/mcp`,
    "",
  ]);
  setStep("discover", "ok");
  return { x402, openapi, card, mesh };
}

async function runCall() {
  setStep("call", "run");
  const route = selectedRoute();
  const body = buildBody(route);
  const curl = payCurl(route, body);
  if (payCurlEl) payCurlEl.value = curl;
  setStatus(`Calling ${route.kind} (unpaid probe)…`, "run");
  log([
    `$ agent.call("${route.kind}", ${JSON.stringify(body)})`,
    `→ POST ${ORIGIN}${route.path}`,
  ]);

  const res = await fetch(`${ORIGIN}${route.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const paymentRequired = res.headers.get("PAYMENT-REQUIRED") || "";
  const { json, raw } = await readJson(res);

  if (res.status === 402) {
    const accepts =
      (() => {
        try {
          const decoded = JSON.parse(atob(paymentRequired));
          return Array.isArray(decoded.accepts) ? decoded.accepts.length : 0;
        } catch {
          return 0;
        }
      })();
    log([
      `← 402 PaymentRequiredError (${route.kind})`,
      `  priceUsdc: ${json?.priceUsdc ?? "—"}`,
      `  acceptCount: ${accepts}`,
      `  PAYMENT-REQUIRED: ${paymentRequired ? `${paymentRequired.slice(0, 72)}…` : "(none)"}`,
      `  payCurl:`,
      `  ${curl}`,
      "",
      "Next: settle with pay.sh / wallet, or open Playground to pay in-browser.",
      "",
    ]);
    setStep("call", "ok");
    setStatus("Payment required — copy payCurl or open Playground", "warn");
    return { status: 402, json, curl };
  }

  if (!res.ok) {
    setStep("call", "err");
    log([`← ${res.status} error`, pretty(json || raw), ""]);
    setStatus(`Call failed (${res.status})`, "err");
    throw new Error(json?.error || `HTTP ${res.status}`);
  }

  log([`← ${res.status} ok`, pretty(json).slice(0, 1200), json && pretty(json).length > 1200 ? "…" : "", ""]);
  setStep("call", "ok");
  setStatus("Call succeeded (settled or free-tier path)", "ok");
  return { status: res.status, json, curl };
}

async function runAll() {
  outEl.textContent = "";
  setStep("mcp", "pending");
  setStep("discover", "pending");
  setStep("call", "pending");
  const btns = document.querySelectorAll("[data-sdk-action]");
  btns.forEach((b) => {
    b.disabled = true;
  });
  try {
    await checkMcp();
    await runDiscover();
    await runCall();
    setStatus("Setup check complete", "ok");
  } catch (e) {
    log([`✗ ${e instanceof Error ? e.message : String(e)}`, ""]);
    setStatus("Setup check failed", "err");
  } finally {
    btns.forEach((b) => {
      b.disabled = false;
    });
  }
}

async function copyPayCurl() {
  const route = selectedRoute();
  const curl = payCurlEl?.value || payCurl(route, buildBody(route));
  try {
    await navigator.clipboard.writeText(curl);
    setStatus("payCurl copied", "ok");
  } catch {
    setStatus("Clipboard blocked — select the payCurl field", "warn");
  }
}

function fillKindSelect() {
  if (!kindEl) return;
  kindEl.innerHTML = ROUTES.map((r) => `<option value="${r.kind}">${r.label}</option>`).join("");
  kindEl.value = "intel-verdict";
  const route = selectedRoute();
  if (payCurlEl) payCurlEl.value = payCurl(route, buildBody(route));
  if (msgEl && route.body?.message) msgEl.value = String(route.body.message);
}

function syncCurlPreview() {
  const route = selectedRoute();
  if (payCurlEl) payCurlEl.value = payCurl(route, buildBody(route));
  const playground = document.getElementById("sdk-playground-link");
  if (playground) {
    playground.href = `/agent/playground?ep=${encodeURIComponent(route.kind)}`;
  }
}

function bind() {
  fillKindSelect();
  syncCurlPreview();
  kindEl?.addEventListener("change", () => {
    const route = selectedRoute();
    if (msgEl && route.body?.message) msgEl.value = String(route.body.message);
    else if (msgEl && !route.body?.message) msgEl.placeholder = "optional message";
    syncCurlPreview();
  });
  msgEl?.addEventListener("input", syncCurlPreview);

  document.getElementById("sdk-run-all")?.addEventListener("click", () => runAll());
  document.getElementById("sdk-discover-only")?.addEventListener("click", async () => {
    outEl.textContent = "";
    setStep("discover", "pending");
    document.querySelectorAll("[data-sdk-action]").forEach((b) => {
      b.disabled = true;
    });
    try {
      await runDiscover();
      setStatus("Discover complete", "ok");
    } catch (e) {
      setStep("discover", "err");
      log([`✗ ${e instanceof Error ? e.message : String(e)}`]);
      setStatus("Discover failed", "err");
    } finally {
      document.querySelectorAll("[data-sdk-action]").forEach((b) => {
        b.disabled = false;
      });
    }
  });
  document.getElementById("sdk-call-only")?.addEventListener("click", async () => {
    outEl.textContent = "";
    setStep("call", "pending");
    document.querySelectorAll("[data-sdk-action]").forEach((b) => {
      b.disabled = true;
    });
    try {
      await runCall();
    } catch (e) {
      setStep("call", "err");
      log([`✗ ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      document.querySelectorAll("[data-sdk-action]").forEach((b) => {
        b.disabled = false;
      });
    }
  });
  document.getElementById("sdk-copy-paycurl")?.addEventListener("click", () => copyPayCurl());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bind);
} else {
  bind();
}
