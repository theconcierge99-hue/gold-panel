import { renderAgentSiteFooter, renderAgentTopNav } from "./agent-nav.mjs";
import { countBySegment } from "./concierge-agent-endpoints.mjs";
import {
  initConciergeLogoParticles,
  initMatrixRain,
  initTypewriter,
} from "./agent-home-fx.mjs";
import { initConciergeFx } from "./concierge-fx.mjs";

renderAgentTopNav("home");
renderAgentSiteFooter();

const countEl = document.getElementById("agent-endpoint-count");
const statEndpoints = document.getElementById("agent-stat-endpoints");
const total = countBySegment().total;
if (countEl) countEl.textContent = String(total);
if (statEndpoints) statEndpoints.textContent = `${total}+`;

const stopMatrix = initMatrixRain(document.getElementById("agent-matrix-canvas"));
const stopLogo = initConciergeLogoParticles(document.getElementById("agent-logo-canvas"));
const stopFx = initConciergeFx();

initTypewriter(document.getElementById("agent-typewriter"), [
  "hottest meteora dlmm yields",
  "btc desk verdict 48h",
  "alpha momentum scan btc",
  "concierge intel airdrop sol",
  "concierge intel tvl snapshot",
  "register agt_ agent identity",
  "concierge intel a2a pipeline",
  "agent a2a mesh discovery",
  "whale positioning eth sol",
]);

window.addEventListener("pagehide", () => {
  stopMatrix();
  stopLogo();
  stopFx();
});
