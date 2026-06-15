import { CONCIERGE_AGENT_ORIGIN, countBySegment } from "./concierge-agent-endpoints.mjs";
import { renderAgentTopNav } from "./agent-nav.mjs";

renderAgentTopNav("discover");

const grid = document.getElementById("discover-grid");
const statusEl = document.getElementById("discover-status");
const origin = CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function preHtml(text) {
  return `<pre class="res-disc-pre">${escapeHtml(text)}</pre>`;
}

function discCard(title, body) {
  return `<article class="res-disc-card"><h3>${escapeHtml(title)}</h3>${body}</article>`;
}

function discLink(href, label) {
  const text = label ?? (href.startsWith("http") ? href : `${origin}${href}`);
  const path = href.startsWith("http") ? href : href;
  return `<a class="res-disc-link" href="${escapeHtml(path)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

async function fetchJson(path) {
  const res = await fetch(`${origin}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function load() {
  if (statusEl) {
    statusEl.textContent = "Loading discovery…";
    statusEl.classList.remove("ok");
  }
  const c = countBySegment();

  try {
    const [x402, config, agentCard] = await Promise.all([
      fetchJson("/.well-known/x402").catch(() => null),
      fetchJson("/api/x402-config").catch(() => null),
      fetchJson("/.well-known/agent-card.json").catch(() => null),
    ]);

    const cards = [];

    cards.push(
      discCard(
        "x402 resources",
        `<p>${x402?.resources?.length ?? c.total} paid routes on this deployment. Fan-out for x402 clients and marketplaces.</p>
        ${discLink("/.well-known/x402", `${origin}/.well-known/x402`)}
        ${x402 ? preHtml(JSON.stringify(x402, null, 2).slice(0, 3500)) : ""}`,
      ),
    );

    cards.push(
      discCard(
        "Public config",
        `<p>Networks, pricing flags, zauth discovery links — no secrets.</p>
        ${discLink("/api/x402-config", `${origin}/api/x402-config`)}
        ${config ? preHtml(JSON.stringify(config, null, 2).slice(0, 2500)) : ""}`,
      ),
    );

    cards.push(
      discCard(
        "Agent card",
        `<p>Register <code>agt_…</code> identities and discover how to call Concierge from other agents.</p>
        ${discLink("/.well-known/agent-card.json", `${origin}/.well-known/agent-card.json`)}
        ${agentCard ? preHtml(JSON.stringify(agentCard, null, 2).slice(0, 2500)) : ""}`,
      ),
    );

    cards.push(
      discCard(
        "OpenAPI",
        `<p>Machine-readable spec with x-payment-info for integrators.</p>
        ${discLink("/openapi.json", `${origin}/openapi.json`)}`,
      ),
    );

    cards.push(
      discCard(
        "Trust directory",
        `<p>Query verified x402 endpoints before paying third-party APIs.</p>
        <div class="res-disc-links">
          ${discLink("/api/zauth-directory?verified=true&limit=20", `${origin}/api/zauth-directory?verified=true&limit=20`)}
          ${discLink("/api/zauth-status", `${origin}/api/zauth-status — this deployment`)}
        </div>`,
      ),
    );

    cards.push(
      discCard(
        "pay.sh",
        `<p>Agent CLI catalog — <code>pay curl</code> handles 402 for Claude, Codex, and shell workflows. Validated: <code>pay catalog check</code> · 20/20 Solana-compatible endpoints.</p>
        ${discLink("https://pay.sh/", "pay.sh")}
        <p class="res-disc-hint"><code>pay --sandbox curl ${origin}/api/concierge-intel-tvl -d '{}'</code></p>
        <p class="res-disc-hint"><a href="/docs/payment/paysh">pay.sh integration guide →</a> · FQN <code>conc-exe/concierge-agent</code></p>`,
      ),
    );

    cards.push(
      discCard(
        "MPP listing",
        `<p>Machine Payments Protocol explorer — same OpenAPI as AgentCash. List <code>${origin}</code> after deploy.</p>
        ${discLink("https://www.mppscan.com/register", "mppscan.com/register")}
        <p class="res-disc-hint"><code>npx -y @agentcash/discovery@latest discover ${origin}</code></p>`,
      ),
    );

    cards.push(
      discCard(
        "x402scan listing",
        `<p>Register on x402scan so agents and explorers index your paid routes.</p>
        ${discLink("https://www.x402scan.com/resources/register", "x402scan.com/resources/register")}`,
      ),
    );

    grid.innerHTML = cards.join("");
    if (statusEl) {
      statusEl.textContent = `Discovery loaded · ${c.total} endpoints · ${origin}`;
      statusEl.classList.add("ok");
    }
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = "Discovery partial — check origin or CORS";
      statusEl.classList.remove("ok");
    }
    grid.innerHTML = discCard(
      "Discovery error",
      `<p>${escapeHtml(e instanceof Error ? e.message : e)}</p>`,
    );
  }
}

load();
