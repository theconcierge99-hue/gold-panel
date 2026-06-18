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
const chipsEl = document.getElementById("res-chips");
const baseUrlEl = document.getElementById("res-base-url");
let activeSegment = "all";

const c = countBySegment();
const origin = CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "");

if (baseUrlEl) baseUrlEl.textContent = origin;

if (chipsEl) {
  chipsEl.innerHTML = [
    `<span><strong>${c.total}</strong> Endpoints</span>`,
    `<span class="dot">·</span><span>x402</span>`,
    `<span class="dot">·</span><span>from $0.02</span>`,
    `<span class="dot">·</span><span>Solana · Base</span>`,
    `<span class="dot">·</span><span>AI-enhanced</span>`,
  ].join("");
}

const SEGMENT_LABELS = {
  concierge: "Concierge",
  research: "Research",
  intel: "DeFi Intel",
  alpha: "Alpha Intel",
  lounge: "Lounge",
};

function segmentCounts() {
  const counts = { all: CONCIERGE_AGENT_ENDPOINTS.length };
  for (const ep of CONCIERGE_AGENT_ENDPOINTS) {
    counts[ep.segment] = (counts[ep.segment] || 0) + 1;
  }
  return counts;
}

function renderFilters() {
  const counts = segmentCounts();
  const segments = [
    { id: "all", label: "All" },
    { id: "concierge", label: "Concierge" },
    { id: "research", label: "Research" },
    { id: "intel", label: "DeFi Intel" },
    { id: "alpha", label: "Alpha Intel" },
    { id: "lounge", label: "Lounge" },
  ];
  filtersEl.innerHTML = segments
    .map((s) => {
      const n = counts[s.id] ?? 0;
      const active = s.id === activeSegment ? " active" : "";
      return `<button type="button" class="res-filter${active}" data-seg="${s.id}">${s.label}<span class="res-filter-n">${n}</span></button>`;
    })
    .join("");
  filtersEl.querySelectorAll(".res-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSegment = btn.dataset.seg || "all";
      renderFilters();
      renderCatalog();
    });
  });
}

function endpointCard(ep) {
  const price = ep.priceUsd.startsWith("$") ? ep.priceUsd : `$${ep.priceUsd}`;
  return `<a class="res-ep" href="/agent/playground?ep=${encodeURIComponent(ep.id)}">
    <div class="res-ep-head">
      <span class="res-ep-route"><span class="res-method">${ep.method}</span><span class="res-path">${ep.path}</span></span>
      <span class="res-ep-price">${price}</span>
    </div>
    <p class="res-ep-desc">${ep.description}</p>
    <code class="res-ep-url">${endpointUrl(ep.path)}</code>
  </a>`;
}

function segmentHeading(seg, n) {
  const label = SEGMENT_LABELS[seg] || seg;
  const unit = n === 1 ? "endpoint" : "endpoints";
  return `<header class="res-seg-head">
    <h2>${label}</h2>
    <span class="res-seg-count"><span class="res-seg-n">(${n})</span>${n} ${unit}</span>
  </header>`;
}

function renderCatalog() {
  const grouped = {};
  for (const ep of CONCIERGE_AGENT_ENDPOINTS) {
    if (activeSegment !== "all" && ep.segment !== activeSegment) continue;
    if (!grouped[ep.segment]) grouped[ep.segment] = [];
    grouped[ep.segment].push(ep);
  }
  const order = ["concierge", "research", "intel", "alpha", "lounge"];
  listEl.innerHTML = order
    .filter((seg) => grouped[seg]?.length)
    .map((seg) => {
      const items = grouped[seg].map(endpointCard).join("");
      return `<section class="res-seg">${segmentHeading(seg, grouped[seg].length)}<div class="res-ep-list">${items}</div></section>`;
    })
    .join("");
}

renderFilters();
renderCatalog();
