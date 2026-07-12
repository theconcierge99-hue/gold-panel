import { CONCIERGE_AGENT_ORIGIN } from "./concierge-agent-endpoints.mjs";
import { renderAgentTopNav } from "./agent-nav.mjs";

renderAgentTopNav("skills");

const origin = CONCIERGE_AGENT_ORIGIN.replace(/\/$/, "");

const SKILLS = [
  {
    id: "concierge-intel",
    name: "concierge-intel",
    title: "Concierge Intel",
    summary:
      "Pay-per-call macro, wire, DeFi TVL, yields, Meteora, whales, wallet, verdict, alpha desks, A2A orchestration, and chat — x402 USDC, no API keys.",
    path: "/skills/concierge-intel/SKILL.md",
    tags: ["x402", "MCP", "pay.sh", "intel", "A2A"],
  },
  {
    id: "concierge-security",
    name: "concierge-security",
    title: "Concierge Security Desk",
    summary:
      "Passive scope validation (free), unified website scan ($0.10), scout audits ($0.02), and free conc-exe.xyz self-audit — authorized external APIs only.",
    path: "/skills/concierge-security/SKILL.md",
    tags: ["x402", "security", "scout", "passive"],
  },
  {
    id: "concierge-edge",
    name: "concierge-edge",
    title: "Concierge Edge × Gemma 4",
    summary:
      "On-device Gemma 4 via LiteRT-LM — tool calling to Concierge intel routes through pay.sh. Local inference, live x402 market data.",
    path: "/skills/concierge-edge/SKILL.md",
    tags: ["edge", "Gemma 4", "LiteRT-LM", "privacy"],
  },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(md) {
  const blocks = [];
  let html = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.length;
    blocks.push(
      `<pre class="skill-code"><code>${escapeHtml(code.trimEnd())}</code></pre>`,
    );
    return `\x00BLOCK${i}\x00`;
  });

  html = escapeHtml(html);

  html = html
    .replace(/^---[\s\S]*?---\n/m, "")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  html = html.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm, (_, header, body) => {
    const ths = header
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => `<th>${c}</th>`)
      .join("");
    const rows = body
      .trim()
      .split("\n")
      .map((row) => {
        const tds = row
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => `<td>${c}</td>`)
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  html = html
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\x00BLOCK(\d+)\x00/g, (_, i) => blocks[Number(i)]);

  return `<div class="skill-md-body"><p>${html}</p></div>`.replace(/<p><\/p>/g, "");
}

function discCard(skill) {
  return `<article class="res-disc-card res-skill-card" data-skill-id="${escapeHtml(skill.id)}">
    <h3>${escapeHtml(skill.title)}</h3>
    <p><code>${escapeHtml(skill.name)}</code></p>
    <p>${escapeHtml(skill.summary)}</p>
    <p class="res-disc-hint">${skill.tags.map((t) => `<span class="res-skill-tag">${escapeHtml(t)}</span>`).join(" ")}</p>
    <button type="button" class="res-skill-open">View skill →</button>
  </article>`;
}

const catalog = document.getElementById("skills-catalog");
const view = document.getElementById("skill-view");
const mdEl = document.getElementById("skill-md");
const titleEl = document.getElementById("skill-view-title");
const rawLink = document.getElementById("skill-raw-link");
const backBtn = document.getElementById("skill-back");

function showCatalog() {
  view.hidden = true;
  catalog.hidden = false;
}

async function showSkill(skill) {
  catalog.hidden = true;
  view.hidden = false;
  titleEl.textContent = skill.name;
  rawLink.href = `${origin}${skill.path}`;
  mdEl.innerHTML = "<p class=\"res-disc-hint\">Loading…</p>";
  try {
    const res = await fetch(`${origin}${skill.path}`, { headers: { Accept: "text/plain" } });
    if (!res.ok) throw new Error(`${res.status}`);
    const text = await res.text();
    mdEl.innerHTML = renderMarkdown(text);
  } catch (e) {
    mdEl.innerHTML = `<p class="res-disc-hint">Failed to load skill: ${escapeHtml(e instanceof Error ? e.message : e)}</p>`;
  }
}

catalog.innerHTML = SKILLS.map(discCard).join("");

catalog.addEventListener("click", (ev) => {
  const card = ev.target.closest("[data-skill-id]");
  if (!card) return;
  const skill = SKILLS.find((s) => s.id === card.dataset.skillId);
  if (skill) showSkill(skill);
});

backBtn?.addEventListener("click", showCatalog);

const params = new URLSearchParams(window.location.search);
const pre = params.get("skill");
const initial = SKILLS.find((s) => s.id === pre);
if (initial) showSkill(initial);
