import { renderAgentSiteFooter, renderAgentTopNav } from "./agent-nav.mjs";
import { countBySegment } from "./concierge-agent-endpoints.mjs";
import {
  initConciergeLogoParticles,
  initMatrixRain,
  initTypewriter,
} from "./agent-home-fx.mjs";

renderAgentTopNav("home");
renderAgentSiteFooter();

const countEl = document.getElementById("agent-endpoint-count");
if (countEl) countEl.textContent = String(countBySegment().total);

const stopMatrix = initMatrixRain(document.getElementById("agent-matrix-canvas"));
const stopLogo = initConciergeLogoParticles(document.getElementById("agent-logo-canvas"));

initTypewriter(document.getElementById("agent-typewriter"), [
  "hottest meteora dlmm yields",
  "btc desk verdict 48h",
  "alpha momentum scan btc",
  "concierge intel airdrop sol",
  "concierge intel tvl snapshot",
  "register agt_ agent identity",
  "whale positioning eth sol",
]);

window.addEventListener("pagehide", () => {
  stopMatrix();
  stopLogo();
});
