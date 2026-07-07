import { renderAgentSiteFooter, renderAgentTopNav } from "./agent-nav.mjs";
import { CONCIERGE_AGENT_ORIGIN, countBySegment } from "./concierge-agent-endpoints.mjs";
import {
  initAgentTerminalDemo,
  initConciergeLogoParticles,
  initMatrixRain,
} from "./agent-home-fx.mjs";
import { initConciergeFx } from "./concierge-fx.mjs";

renderAgentTopNav("home", { variant: "home" });
renderAgentSiteFooter();

const total = countBySegment().total;
const origin = CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "");

for (const id of ["agent-endpoint-count", "agent-proof-routes"]) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(total);
}

const MODULES = [
  {
    tag: "Desk",
    title: "Executive Lounge",
    desc: "Concierge AI chat, RWA creator signals, and the private intelligence lobby.",
    href: "/lounge",
    cta: "Enter Lounge",
  },
  {
    tag: "Intel",
    title: "Research API",
    desc: "Macro, wire digest, desk verdict, Meteora yields — tiered x402 intel routes.",
    href: "/agent/endpoints",
    cta: "Browse catalog",
  },
  {
    tag: "Commerce",
    title: "x402 Playground",
    desc: "Probe paid routes, settle USDC on Solana or Base, or Token Pay SPL merchants.",
    href: "/agent/playground",
    cta: "Open Playground",
  },
  {
    tag: "Identity",
    title: "Agent mesh",
    desc: "Discover x402 resources, agent cards, A2A mesh, and register agt_ identities.",
    href: "/agent/discover",
    cta: "Discover",
  },
];

const grid = document.getElementById("agent-modules-grid");
if (grid) {
  grid.innerHTML = MODULES.map(
    (m) => `<a class="agent-module-card" href="${m.href}">
      <span class="agent-module-tag">${m.tag}</span>
      <h3>${m.title}</h3>
      <p>${m.desc}</p>
      <span class="agent-module-cta">${m.cta} →</span>
    </a>`,
  ).join("");
}

async function loadAccuracy() {
  const el = document.getElementById("agent-proof-accuracy");
  if (!el) return;
  try {
    const res = await fetch(`${origin}/api/concierge-intel-accuracy`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("accuracy unavailable");
    const data = await res.json();
    const pct = data?.evaluated?.hitRatePct;
    if (pct != null) el.textContent = `${pct}%`;
    else el.textContent = "Live";
  } catch {
    el.textContent = "Live";
  }
}

loadAccuracy();

const stopMatrix = initMatrixRain(document.getElementById("agent-matrix-canvas"));
const stopLogo = initConciergeLogoParticles(document.getElementById("agent-logo-canvas"));
const stopFx = initConciergeFx();
const stopTerminal = initAgentTerminalDemo(
  document.getElementById("agent-typewriter"),
  document.getElementById("agent-terminal-status"),
  origin,
);

window.addEventListener("pagehide", () => {
  stopMatrix();
  stopLogo();
  stopFx();
  stopTerminal();
});
