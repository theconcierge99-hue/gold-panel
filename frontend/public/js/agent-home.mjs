import { renderAgentSiteFooter, renderAgentTopNav } from "./agent-nav.mjs";
import { CONCIERGE_AGENT_ORIGIN, countBySegment } from "./concierge-agent-endpoints.mjs";
import {
  animateCount,
  animatePercent,
  getPillarIconHtml,
  initAgentAmbientParallax,
  initAgentTerminalDemo,
  initConciergeLogoParticles,
  initCtaGlow,
  initMetricsBandFx,
  initStaggerReveal,
} from "./agent-home-fx.mjs";
import { initConciergeFx } from "./concierge-fx.mjs";

renderAgentTopNav("home", { variant: "home" });
renderAgentSiteFooter();

const total = countBySegment().total;
const origin = CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "");

const endpointEl = document.getElementById("agent-endpoint-count");
const routesEl = document.getElementById("agent-proof-routes");
const metricStops = [];

if (endpointEl) {
  metricStops.push(animateCount(endpointEl, total, { duration: 1400, delay: 400 }));
}
if (routesEl) {
  routesEl.classList.add("is-counting");
  metricStops.push(
    animateCount(routesEl, total, {
      duration: 1600,
      delay: 600,
    }),
  );
  window.setTimeout(() => routesEl.classList.remove("is-counting"), 2400);
}

const STACK_PARTNERS = [
  { name: "PayAI", logo: "/images/integrations/payai.png", href: "https://docs.payai.network/", external: true },
  { name: "x402scan", logo: "/images/integrations/x402scan.png", href: "/docs/integration/x402scan", external: false },
  { name: "OOBE", logo: "https://www.oobeprotocol.ai/favicon.ico", href: "/docs/integration/oobe", external: false },
  { name: "pay.sh", logo: "/images/integrations/paysh.svg", href: "/docs/payment/paysh", external: false },
  { name: "Solana", logo: "/images/integrations/solana.svg", href: "https://solana.com/", external: true },
  { name: "Base", logo: "/images/integrations/base.svg", href: "https://base.org/", external: true },
  { name: "Arbitrum", logo: "/images/integrations/arbitrum.svg", href: "https://arbitrum.io/", external: true },
  { name: "Robinhood Chain", logo: "https://cdn.robinhood.com/assets/generated_assets/hoodchain_docsite/rh_favicon_32.png", href: "https://docs.robinhood.com/chain/", external: true },
  { name: "x402", logo: "/images/integrations/x402.svg", href: "/docs/payment/x402", external: false },
  { name: "Metaplex", logo: "/images/integrations/metaplex.svg", href: "/docs/integration/metaplex", external: false },
  { name: "Privy", logo: "/images/integrations/privy.svg", href: "/docs/integration/privy", external: false },
  { name: "HYRE", logo: "/images/integrations/hyre.ico", href: "/docs/integration/hyre", external: false },
  { name: "Claude", logo: "/images/integrations/anthropic.png", href: "/docs/integration/anthropic", external: false },
  { name: "OpenAI", logo: "/images/integrations/openai.png", href: "/docs/integration/openai", external: false },
  { name: "Gemma 4", logo: "/images/integrations/deepmind.png", href: "/docs/integration/gemma", external: false },
  { name: "Poncho", logo: "/images/integrations/poncho.png", href: "/docs/integration/poncho", external: false },
];

function renderStackMarquee() {
  const track = document.getElementById("agent-trust-track");
  if (!track) return;

  const chip = (p) => {
    const attrs = p.external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a class="agent-stack-chip" href="${p.href}"${attrs}><img src="${p.logo}" alt="" width="28" height="28" loading="lazy" /><span>${p.name}</span></a>`;
  };

  const chips = STACK_PARTNERS.map(chip).join("");
  track.classList.add("agent-stack-track--scroll");
  track.innerHTML = `
    <div class="agent-stack-group" aria-hidden="false">${chips}</div>
    <div class="agent-stack-group" aria-hidden="true">${chips}</div>
  `;
}

renderStackMarquee();

const ABOUT = [
  {
    icon: "intel",
    title: "Intel routes",
    desc: "Macro briefs, wire digest, desk verdict, and Meteora yields — tiered pay-per-call research APIs from $0.02.",
  },
  {
    icon: "intel",
    title: "Concierge Resources",
    desc: "Agent chat ($0.05), image generation, and HTML scaffold — creative pay-per-call endpoints with TCX credits or USDC x402.",
  },
  {
    icon: "security",
    title: "Security Desk",
    desc: "Passive website breakdown — Surface Review, scout readiness and headers, tiered desk modules. Authorized targets only.",
  },
  {
    icon: "x402",
    title: "x402 settlement",
    desc: "HTTP 402 micropayments on Solana, Base, Arbitrum, and Robinhood Chain. Settle USDC via facilitators, USDG on Robinhood, or TCX via Token Pay and prepaid credits.",
  },
  {
    icon: "mesh",
    title: "Agent mesh",
    desc: "Discover x402 resources, agent cards, MCP skills, and register agt_ identities for autonomous workflows.",
  },
];

const aboutGrid = document.getElementById("agent-about-grid");
if (aboutGrid) {
  aboutGrid.innerHTML = ABOUT.map(
    (a) => `<article class="agent-about-card el-reveal-item">
      ${getPillarIconHtml(a.icon)}
      <h3>${a.title}</h3>
      <p>${a.desc}</p>
    </article>`,
  ).join("");
}

const MODULES = [
  {
    tag: "TCX",
    title: "Token Research",
    desc: "Holder structure scanner — balance bands, tier gates, and Phantom wallet lookup for TCX perks.",
    href: "/lounge#token-research",
    cta: "Open in Lounge",
  },
  {
    tag: "Desk",
    title: "Executive Lounge",
    desc: "Concierge AI chat, RWA creator signals, and the private intelligence lobby.",
    href: "/lounge",
    cta: "Enter Lounge",
  },
  {
    tag: "Security",
    title: "Security Desk",
    desc: "Unified website scan ($0.10), scout routes ($0.02), free conc-exe.xyz self-audit — Lounge UI and x402 API.",
    href: "/lounge#security-scan",
    cta: "Open Security Scan",
  },
  {
    tag: "Resources",
    title: "Creative API",
    desc: "Chat, image, and HTML scaffold — $0.05–$0.10 per call. Filter Resources on the endpoint catalog.",
    href: "/agent/endpoints",
    cta: "Browse Resources",
  },
  {
    tag: "Intel",
    title: "Research API",
    desc: "Browse 24 x402 routes — macro, wire, verdict, yields, alpha desks, and Concierge Resources.",
    href: "/agent/endpoints",
    cta: "Browse catalog",
  },
  {
    tag: "Commerce",
    title: "x402 Playground",
    desc: "Probe paid routes, settle USDC on Solana/Base/Arbitrum, USDG on Robinhood, TCX via Token Pay, or test SPL merchants in one workspace.",
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
    (m) => `<a class="agent-eco-card el-reveal-item" href="${m.href}">
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
    if (pct != null) {
      el.classList.add("is-counting");
      metricStops.push(animatePercent(el, pct, { duration: 1200, delay: 200 }));
      window.setTimeout(() => el.classList.remove("is-counting"), 1600);
    } else el.textContent = "Live";
  } catch {
    el.textContent = "Live";
  }
}

loadAccuracy();

const staggerStops = [
  initStaggerReveal(aboutGrid, { baseDelay: 110 }),
  initStaggerReveal(document.getElementById("agent-metrics-grid"), { baseDelay: 90 }),
  initStaggerReveal(grid, { baseDelay: 100 }),
];
const stopMetricsFx = initMetricsBandFx(document.querySelector(".agent-metrics"));
const stopCtaGlow = initCtaGlow(document.getElementById("agent-cta-band-inner"));

const stopFx = initConciergeFx();
const stopAmbient = initAgentAmbientParallax();
const stopLogo = initConciergeLogoParticles(document.getElementById("agent-demo-logo-canvas"));
const stopTerminal = initAgentTerminalDemo(
  document.getElementById("agent-typewriter"),
  document.getElementById("agent-terminal-status"),
  origin,
  document.getElementById("agent-demo-panel"),
);

window.addEventListener("pagehide", () => {
  stopFx();
  stopAmbient();
  stopLogo();
  stopTerminal();
  stopMetricsFx();
  stopCtaGlow();
  staggerStops.forEach((s) => s?.());
  metricStops.forEach((s) => s?.());
});
