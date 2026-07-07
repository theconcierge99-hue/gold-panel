import { renderAgentSiteFooter, renderAgentTopNav } from "./agent-nav.mjs";
import { CONCIERGE_AGENT_ORIGIN, countBySegment } from "./concierge-agent-endpoints.mjs";
import { initAgentTerminalDemo } from "./agent-home-fx.mjs";
import { initConciergeFx } from "./concierge-fx.mjs";

renderAgentTopNav("home", { variant: "home" });
renderAgentSiteFooter();

const total = countBySegment().total;
const origin = CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "");

for (const id of ["agent-endpoint-count", "agent-proof-routes"]) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(total);
}

const STACK_PARTNERS = [
  { name: "PayAI", logo: "/images/integrations/payai.png", href: "https://docs.payai.network/", external: true },
  { name: "x402scan", logo: "/images/integrations/x402scan.png", href: "/docs/integration/x402scan", external: false },
  { name: "OOBE", logo: "https://www.oobeprotocol.ai/favicon.ico", href: "/docs/integration/oobe", external: false },
  { name: "pay.sh", logo: "/images/integrations/paysh.svg", href: "/docs/payment/paysh", external: false },
  { name: "Solana", logo: "/images/integrations/solana.svg", href: "https://solana.com/", external: true },
  { name: "Base", logo: "/images/integrations/base.svg", href: "https://base.org/", external: true },
  { name: "x402", logo: "/images/integrations/x402.svg", href: "/docs/payment/x402", external: false },
  { name: "Metaplex", logo: "/images/integrations/openapi.svg", href: "/docs/integration/metaplex", external: false },
  { name: "Privy", logo: "/images/integrations/privy.svg", href: "/docs/integration/privy", external: false },
  { name: "Poncho", logo: "/images/integrations/poncho.png", href: "/docs/integration/poncho", external: false },
];

function renderStackMarquee() {
  const track = document.getElementById("agent-trust-track");
  if (!track) return;

  const chip = (p) => {
    const attrs = p.external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a class="agent-stack-chip" href="${p.href}"${attrs}><img src="${p.logo}" alt="" width="18" height="18" loading="lazy" /><span>${p.name}</span></a>`;
  };

  track.classList.remove("agent-stack-track--scroll");
  track.innerHTML = `<div class="agent-stack-set">${STACK_PARTNERS.map(chip).join("")}</div>`;
}

renderStackMarquee();

const ABOUT = [
  {
    title: "Intel routes",
    desc: "Macro briefs, wire digest, desk verdict, and Meteora yields — tiered pay-per-call research APIs.",
  },
  {
    title: "x402 settlement",
    desc: "HTTP 402 micropayments on Solana and Base. Payment is the only gate — no API keys or subscriptions.",
  },
  {
    title: "Agent mesh",
    desc: "Discover x402 resources, agent cards, MCP skills, and register agt_ identities for autonomous workflows.",
  },
];

const aboutGrid = document.getElementById("agent-about-grid");
if (aboutGrid) {
  aboutGrid.innerHTML = ABOUT.map(
    (a) => `<article class="agent-about-card"><h3>${a.title}</h3><p>${a.desc}</p></article>`,
  ).join("");
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
    desc: "Browse 15+ x402 intel routes — macro, wire, verdict, security desk, and more.",
    href: "/agent/endpoints",
    cta: "Browse catalog",
  },
  {
    tag: "Commerce",
    title: "x402 Playground",
    desc: "Probe paid routes, settle USDC, or test Token Pay SPL merchants in one workspace.",
    href: "/agent/playground",
    cta: "Open Playground",
  },
  {
    tag: "Identity",
    title: "Agent mesh",
    desc: "Discover resources, agent cards, A2A mesh, and register agt_ identities.",
    href: "/agent/discover",
    cta: "Discover",
  },
];

const grid = document.getElementById("agent-modules-grid");
if (grid) {
  grid.innerHTML = MODULES.map(
    (m) => `<a class="agent-eco-card" href="${m.href}">
      <span class="agent-eco-tag">${m.tag}</span>
      <h3>${m.title}</h3>
      <p>${m.desc}</p>
      <span class="agent-eco-cta">${m.cta} →</span>
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

const stopFx = initConciergeFx();
const stopTerminal = initAgentTerminalDemo(
  document.getElementById("agent-typewriter"),
  document.getElementById("agent-terminal-status"),
  origin,
);

window.addEventListener("pagehide", () => {
  stopFx();
  stopTerminal();
});
