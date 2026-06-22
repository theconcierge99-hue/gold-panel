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
    const [x402, config, agentCard, tokenPay, accuracy, a2aMesh] = await Promise.all([
      fetchJson("/.well-known/x402").catch(() => null),
      fetchJson("/api/x402-config").catch(() => null),
      fetchJson("/.well-known/agent-card.json").catch(() => null),
      fetchJson("/api/token-pay").catch(() => null),
      fetchJson("/api/concierge-intel-accuracy").catch(() => null),
      fetchJson("/api/agent-a2a-mesh").catch(() => null),
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
        "Token Pay",
        `<p>Native SPL x402 self-settle — multi-merchant registry. Check <code>readiness.status</code> per merchant (<code>ready</code> = will appear in 402 accepts).</p>
        ${discLink("/api/token-pay", `${origin}/api/token-pay`)}
        ${discLink("/docs/payment/token-pay", `${origin}/docs/payment/token-pay — verify guide`)}
        ${tokenPay ? `<p class="res-disc-hint">acceptReady: <strong>${tokenPay.acceptReadyCount ?? tokenPay.merchants?.filter((m) => m.readiness?.acceptReady).length ?? 0}</strong> / ${tokenPay.merchants?.length ?? 0} merchants</p>` : ""}
        ${tokenPay ? preHtml(JSON.stringify(tokenPay, null, 2).slice(0, 2500)) : ""}`,
      ),
    );

    cards.push(
      discCard(
        "Agent card",
        `<p>Register <code>agt_…</code> identities and discover how to call Concierge from other agents.</p>
        ${discLink("/.well-known/agent-card.json", `${origin}/.well-known/agent-card.json`)}
        ${agentCard?.discovery?.a2aMesh ? `<p class="res-disc-hint">A2A mesh: <code>${escapeHtml(String(agentCard.discovery.a2aMesh))}</code></p>` : ""}
        ${agentCard?.trust ? `<p class="res-disc-hint">Trust: <code>${escapeHtml(agentCard.trust.intelAccuracyEndpoint || "")}</code></p>` : ""}
        ${agentCard ? preHtml(JSON.stringify(agentCard, null, 2).slice(0, 2500)) : ""}`,
      ),
    );

    cards.push(
      discCard(
        "A2A mesh",
        `<p>Free orchestration discovery — pipeline templates, registered peer agents, and handoff guidance for downstream agents.</p>
        <div class="res-disc-links">
          ${discLink("/api/agent-a2a-mesh", `${origin}/api/agent-a2a-mesh`)}
          ${discLink("/agent/playground?ep=intel-a2a-pipeline", `${origin}/agent/playground?ep=intel-a2a-pipeline — probe`)}
          ${discLink("/docs/api/intel#a2a", `${origin}/docs/api/intel#a2a — intel docs`)}
        </div>
        ${a2aMesh ? `<p class="res-disc-hint">Pipelines: <strong>${a2aMesh.pipelines?.length ?? 0}</strong> · Peers: <strong>${a2aMesh.agents?.length ?? 0}</strong></p>` : ""}
        ${a2aMesh ? preHtml(JSON.stringify(a2aMesh, null, 2).slice(0, 2500)) : ""}`,
      ),
    );

    const accuracyHint =
      accuracy?.evaluated?.hitRatePct != null
        ? `<p class="res-disc-hint">Evaluated: <strong>${accuracy.evaluated.total}</strong> · hit rate: <strong>${accuracy.evaluated.hitRatePct}%</strong> · as of ${escapeHtml(String(accuracy.dataAsOf || "").slice(0, 19))}</p>`
        : `<p class="res-disc-hint">Track record builds as paid <code>intel-verdict</code> calls settle.</p>`;

    cards.push(
      discCard(
        "Verdict accuracy",
        `<p>Free trust signal — public leaderboard scoring desk verdicts vs 24h BTC alignment. Documented in OpenAPI and agent card <code>trust</code> block.</p>
        <div class="res-disc-links">
          ${discLink("/api/concierge-intel-accuracy", `${origin}/api/concierge-intel-accuracy`)}
          ${discLink("/docs/builders/case-study", `${origin}/docs/builders/case-study — B2B case study`)}
        </div>
        ${accuracyHint}
        ${accuracy ? preHtml(JSON.stringify(accuracy, null, 2).slice(0, 2500)) : ""}`,
      ),
    );

    cards.push(
      discCard(
        "MCP Registry",
        `<p>Official MCP Registry — <code>xyz.conc-exe/concierge-intel</code> v1.0.1. Remote: streamable HTTP at <code>/api/mcp</code>.</p>
        <div class="res-disc-links">
          ${discLink("/api/mcp", `${origin}/api/mcp`)}
          ${discLink("https://registry.modelcontextprotocol.io/?search=xyz.conc-exe%2Fconcierge-intel", "registry.modelcontextprotocol.io — Concierge Intel")}
          ${discLink("/skills/concierge-intel/SKILL.md", `${origin}/skills/concierge-intel/SKILL.md`)}
          ${discLink("/docs/integration/mcp-registry", `${origin}/docs/integration/mcp-registry`)}
        </div>
        ${config?.pricingTiers ? `<p class="res-disc-hint">Tiers: raw $${config.pricingTiers.rawUsdc} · signal $${config.pricingTiers.signalUsdc} · bundle $${config.pricingTiers.bundleUsdc}</p>` : ""}`,
      ),
    );

    cards.push(
      discCard(
        "OpenAPI",
        `<p>Machine-readable spec with x-payment-info, ApiError schema, and request examples.</p>
        ${discLink("/openapi.json", `${origin}/openapi.json`)}
        ${discLink("/docs/api/agent-readiness", `${origin}/docs/api/agent-readiness — audit guide`)}`,
      ),
    );

    cards.push(
      discCard(
        "Agent readiness",
        `<p>RFC 9727 catalog, rate-limit headers, idempotency — observable signals for autonomous agents.</p>
        <div class="res-disc-links">
          ${discLink("/.well-known/api-catalog", `${origin}/.well-known/api-catalog`)}
          ${discLink("/asyncapi.json", `${origin}/asyncapi.json`)}
          ${discLink("/docs/api/agent-readiness", `${origin}/docs/api/agent-readiness`)}
        </div>
        <p class="res-disc-hint">Live verify: <code>curl -s ${origin}/api/concierge-intel-accuracy | jq '.evaluated'</code></p>`,
      ),
    );

    cards.push(
      discCard(
        "Agent Skills",
        `<p>Portable <code>SKILL.md</code> for Cursor, Claude, and Grok — x402 probes, pricing tiers, MCP connect.</p>
        <div class="res-disc-links">
          ${discLink("/agent/skills", `${origin}/agent/skills`)}
          ${discLink("/skills/concierge-intel/SKILL.md", `${origin}/skills/concierge-intel/SKILL.md`)}
        </div>`,
      ),
    );

    cards.push(
      discCard(
        "MCP listing",
        `<p><strong>Published</strong> on the official MCP Registry — <code>xyz.conc-exe/concierge-intel</code> v1.0.1.</p>
        <div class="res-disc-links">
          ${discLink("https://registry.modelcontextprotocol.io/?search=xyz.conc-exe%2Fconcierge-intel", "Official listing ↗")}
          ${discLink("/docs/integration/mcp-registry", `${origin}/docs/integration/mcp-registry`)}
        </div>`,
      ),
    );

    cards.push(
      discCard(
        "Distribution",
        `<p>External catalogs link to <code>conc-exe.xyz</code> — pay.sh, MPPscan, thebuyside <code>pay.discover</code>.</p>
        ${discLink("/docs/api/agent-readiness", `${origin}/docs/api/agent-readiness — distribution status`)}
        ${discLink("/docs/builders/case-study", `${origin}/docs/builders/case-study — B2B case study`)}`,
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
        `<p>Agent CLI catalog — <code>pay curl</code> handles 402 for Claude, Codex, and shell workflows. Validated: <code>pay catalog check</code> · Solana-compatible endpoints.</p>
        ${discLink("https://pay.sh/", "pay.sh")}
        <p class="res-disc-hint">Production (mainnet): <code>pay setup</code> · <code>pay topup</code> · <code>pay curl ${origin}/api/concierge-intel-tvl -d '{}'</code></p>
        <p class="res-disc-hint">Sandbox demo: <code>pay --sandbox curl https://debugger.pay.sh/mpp/quote/AAPL</code></p>
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
