import { CONCIERGE_AGENT_ORIGIN, countBySegment } from "./concierge-agent-endpoints.mjs";
import "./agent-hub.mjs";

const grid = document.getElementById("discover-grid");
const statusEl = document.getElementById("discover-status");

function pre(text) {
  const el = document.createElement("pre");
  el.className = "agent-disc-pre";
  el.textContent = text;
  return el;
}

async function fetchJson(path) {
  const res = await fetch(`${CONCIERGE_AGENT_ORIGIN}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function load() {
  statusEl.textContent = "Loading discovery…";
  const cards = [];
  const c = countBySegment();

  try {
    const [x402, config, agentCard] = await Promise.all([
      fetchJson("/.well-known/x402").catch(() => null),
      fetchJson("/api/x402-config").catch(() => null),
      fetchJson("/.well-known/agent-card.json").catch(() => null),
    ]);

    cards.push(`
      <div class="agent-disc-card">
        <h3>x402 resources</h3>
        <p>${x402?.resources?.length ?? c.total} paid routes on this deployment. Fan-out for x402 clients and marketplaces.</p>
        <a href="/.well-known/x402" target="_blank" rel="noopener">${CONCIERGE_AGENT_ORIGIN}/.well-known/x402</a>
        ${x402 ? pre(JSON.stringify(x402, null, 2).slice(0, 3500)) : ""}
      </div>`);

    cards.push(`
      <div class="agent-disc-card">
        <h3>Public config</h3>
        <p>Networks, pricing flags, zauth discovery links — no secrets.</p>
        <a href="/api/x402-config" target="_blank" rel="noopener">${CONCIERGE_AGENT_ORIGIN}/api/x402-config</a>
        ${config ? pre(JSON.stringify(config, null, 2).slice(0, 2500)) : ""}
      </div>`);

    cards.push(`
      <div class="agent-disc-card">
        <h3>Agent card</h3>
        <p>Register <code>agt_…</code> identities and discover how to call Concierge from other agents.</p>
        <a href="/.well-known/agent-card.json" target="_blank" rel="noopener">${CONCIERGE_AGENT_ORIGIN}/.well-known/agent-card.json</a>
        ${agentCard ? pre(JSON.stringify(agentCard, null, 2).slice(0, 2500)) : ""}
      </div>`);

    cards.push(`
      <div class="agent-disc-card">
        <h3>OpenAPI</h3>
        <p>Machine-readable spec with x-payment-info for integrators.</p>
        <a href="/openapi.json" target="_blank" rel="noopener">${CONCIERGE_AGENT_ORIGIN}/openapi.json</a>
      </div>`);

    cards.push(`
      <div class="agent-disc-card">
        <h3>Trust directory</h3>
        <p>Query verified x402 endpoints before paying third-party APIs.</p>
        <a href="/api/zauth-directory?verified=true&amp;limit=20" target="_blank" rel="noopener">/api/zauth-directory</a>
        <p style="margin-top:10px"><a href="/api/zauth-status" target="_blank" rel="noopener">/api/zauth-status</a> — this deployment</p>
      </div>`);

    cards.push(`
      <div class="agent-disc-card">
        <h3>Marketplace listing</h3>
        <p>Register on x402scan so agents and explorers index your paid routes.</p>
        <a href="https://www.x402scan.com/resources/register" target="_blank" rel="noopener">x402scan.com/resources/register</a>
      </div>`);

    grid.innerHTML = cards.join("");
    statusEl.textContent = `Discovery loaded · ${c.total} endpoints · ${CONCIERGE_AGENT_ORIGIN}`;
  } catch (e) {
    statusEl.textContent = "Discovery partial — check origin or CORS";
    grid.innerHTML = `<div class="agent-disc-card"><p>${String(e instanceof Error ? e.message : e)}</p></div>`;
  }
}

load();
