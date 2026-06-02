import {
  CONCIERGE_AGENT_ENDPOINTS,
  CONCIERGE_AGENT_ORIGIN,
  endpointUrl,
  countBySegment,
} from "./concierge-agent-endpoints.mjs";
import { renderAgentTopNav } from "./agent-nav.mjs";

renderAgentTopNav("endpoints");

const listEl = document.getElementById("endpoint-catalog");
const filtersEl = document.getElementById("agent-filters");
const statsEl = document.getElementById("agent-stats");
let activeSegment = "all";

const c = countBySegment();
if (statsEl) {
  statsEl.textContent = `${c.total} endpoints · x402 · Pay per call · ${CONCIERGE_AGENT_ORIGIN.replace(/^https?:\/\//, "")}`;
}

const SEGMENT_LABELS = {
  concierge: "Concierge",
  intel: "DeFi Intel",
  lounge: "Lounge",
};

function renderFilters() {
  const counts = { all: CONCIERGE_AGENT_ENDPOINTS.length };
  for (const ep of CONCIERGE_AGENT_ENDPOINTS) {
    counts[ep.segment] = (counts[ep.segment] || 0) + 1;
  }
  const segments = [
    { id: "all", label: "All" },
    { id: "concierge", label: "Concierge" },
    { id: "intel", label: "DeFi Intel" },
    { id: "lounge", label: "Lounge" },
  ];
  filtersEl.innerHTML = segments
    .map((s) => {
      const n = counts[s.id] ?? 0;
      const active = s.id === activeSegment ? " active" : "";
      return `<button type="button" class="agent-filter${active}" data-seg="${s.id}">${s.label} (${n})</button>`;
    })
    .join("");
  filtersEl.querySelectorAll(".agent-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSegment = btn.dataset.seg || "all";
      renderFilters();
      renderCatalog();
    });
  });
}

function renderCatalog() {
  const grouped = {};
  for (const ep of CONCIERGE_AGENT_ENDPOINTS) {
    if (activeSegment !== "all" && ep.segment !== activeSegment) continue;
    if (!grouped[ep.segment]) grouped[ep.segment] = [];
    grouped[ep.segment].push(ep);
  }
  const order = ["concierge", "intel", "lounge"];
  listEl.innerHTML = order
    .filter((seg) => grouped[seg]?.length)
    .map((seg) => {
      const items = grouped[seg]
        .map(
          (ep) => `
        <a class="agent-ep" href="/agent/playground?ep=${encodeURIComponent(ep.id)}">
          <div>
            <div class="agent-ep-method">${ep.method}</div>
            <div class="agent-ep-path">${ep.path}</div>
            <div class="agent-ep-desc">${ep.name} — ${ep.description}</div>
            <div class="agent-ep-url">${endpointUrl(ep.path)}</div>
          </div>
          <div class="agent-ep-price">$${ep.priceUsd}</div>
        </a>`,
        )
        .join("");
      return `<section class="agent-segment"><h2 class="agent-segment-h">${SEGMENT_LABELS[seg] || seg} <span>(${grouped[seg].length})</span></h2><div class="agent-endpoint-list">${items}</div></section>`;
    })
    .join("");
}

renderFilters();
renderCatalog();
