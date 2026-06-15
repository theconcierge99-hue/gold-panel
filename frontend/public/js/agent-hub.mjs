import {
  CONCIERGE_AGENT_ENDPOINTS,
  CONCIERGE_AGENT_ORIGIN,
  countBySegment,
} from "./concierge-agent-endpoints.mjs";

const PAGE = document.body.dataset.agentPage || "";

function themeInit() {
  const t = localStorage.getItem("el-theme");
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
}

function renderSubnav() {
  const el = document.getElementById("agent-subnav");
  if (!el) return;
  const links = [
    { href: "/agent/endpoints", page: "endpoints", label: "Endpoints" },
    { href: "/agent/playground", page: "playground", label: "Playground" },
    { href: "/agent/discover", page: "discover", label: "Discover" },
    { href: "/#agent-identity", page: "identity", label: "Agent identity" },
  ];
  el.innerHTML = links
    .map((l) => {
      const active = l.page === PAGE ? " active" : "";
      return `<a class="agent-subnav-i${active}" href="${l.href}">${l.label}</a>`;
    })
    .join("");
}

window.openAgentIdentityFromHub = function () {
  location.href = "/#agent-identity";
};

function renderStats() {
  const el = document.getElementById("agent-stats");
  if (!el) return;
  const c = countBySegment();
  el.textContent = `${c.total} endpoints · x402 · Pay per call · ${CONCIERGE_AGENT_ORIGIN.replace(/^https?:\/\//, "")}`;
}

themeInit();
renderSubnav();
renderStats();

export { CONCIERGE_AGENT_ENDPOINTS, CONCIERGE_AGENT_ORIGIN, countBySegment };
