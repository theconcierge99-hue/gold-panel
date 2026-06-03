import { renderAgentSiteFooter, renderAgentTopNav } from "./agent-nav.mjs";
import {
  initConciergeLogoParticles,
  initMatrixRain,
  initTypewriter,
} from "./agent-home-fx.mjs";

renderAgentTopNav("home");
renderAgentSiteFooter();

const stopMatrix = initMatrixRain(document.getElementById("agent-matrix-canvas"));
const stopLogo = initConciergeLogoParticles(document.getElementById("agent-logo-canvas"));

initTypewriter(document.getElementById("agent-typewriter"), [
  "hottest meteora dlmm yields",
  "btc desk verdict 48h",
  "concierge intel tvl snapshot",
  "register agt_ agent identity",
  "whale positioning eth sol",
]);

window.addEventListener("pagehide", () => {
  stopMatrix();
  stopLogo();
});
