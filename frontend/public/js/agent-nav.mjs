/** Lounge-style site footer — minimal, no nav duplication. */
export function renderAgentSiteFooter(containerId = "agent-site-footer") {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <div class="agent-site-footer">
      <div class="agent-foot-row">
        <nav class="agent-foot-links" aria-label="Site links">
          <a class="agent-foot-link" href="/integrations">Integrations</a>
          <span class="agent-foot-dot" aria-hidden="true">·</span>
          <a class="agent-foot-link" href="/about" rel="noopener noreferrer">About</a>
        </nav>
        <div class="agent-foot-social">
          <a class="agent-foot-social-btn" href="https://x.com/Th3concierge_" target="_blank" rel="noopener noreferrer" aria-label="Follow on X @Th3concierge_">
            <img src="/images/x-social.png" alt="" width="16" height="16" />
          </a>
          <a class="agent-foot-social-btn agent-foot-social-btn--telegram" href="https://t.me/Theconcierge33" target="_blank" rel="noopener noreferrer" aria-label="Telegram @Theconcierge33">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          </a>
        </div>
      </div>
    </div>`;
}

function syncThemeButtons() {
  const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-theme-btn") === theme);
  });
}

function bindThemeToggle(root) {
  root?.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-theme-btn") === "light" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("el-theme", next);
      syncThemeButtons();
    });
  });
  syncThemeButtons();
}

function bindMoreMenu(root) {
  const btn = root?.querySelector(".pg-nav-more-btn");
  const menu = root?.querySelector(".pg-nav-more-menu");
  if (!btn || !menu) return;

  const close = () => {
    menu.classList.remove("open");
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    btn.classList.toggle("active", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  menu.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", (e) => {
    if (btn.contains(e.target) || menu.contains(e.target)) return;
    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

const MORE_LINKS = [
  { id: "skills", href: "/agent/skills", label: "Skills" },
  { id: "token-pay", href: "/agent/token-pay", label: "Token Pay" },
  { id: "identity", href: "/agent/identity", label: "Identity" },
  { id: "demo", href: "/demo", label: "Demo" },
];

const HUB_LINKS = [
  { id: "endpoints", href: "/agent/endpoints", label: "Endpoints" },
  { id: "playground", href: "/agent/playground", label: "Playground" },
  { id: "discover", href: "/agent/discover", label: "Discover" },
  { id: "docs", href: "/docs", label: "Docs" },
];

const HOME_LINKS = [
  { id: "discover", href: "/agent/discover", label: "Discover" },
  { id: "docs", href: "/docs", label: "Docs" },
];

function navLink(l, activeId) {
  const cls = l.id === activeId ? " active" : "";
  return `<a href="${l.href}" class="${cls.trim()}">${l.label}</a>`;
}

function moreMenu(activeId) {
  const items = MORE_LINKS.map((l) => {
    const cls = l.id === activeId ? " active" : "";
    return `<a href="${l.href}" class="${cls.trim()}">${l.label}</a>`;
  }).join("");
  const isOpen = MORE_LINKS.some((l) => l.id === activeId);
  return `
    <div class="pg-nav-more">
      <button type="button" class="pg-nav-more-btn${isOpen ? " active" : ""}" aria-expanded="false" aria-haspopup="true">More</button>
      <div class="pg-nav-more-menu" role="menu">${items}</div>
    </div>`;
}

/**
 * Shared top nav for Concierge Agent hub pages.
 * @param {string} activeId
 * @param {{ variant?: 'home' | 'hub' }} [options]
 */
export function renderAgentTopNav(activeId, options = {}) {
  const el = document.getElementById("agent-topnav");
  if (!el) return;

  document.body.classList.add("el-premium");

  const isHome = options.variant === "home" || activeId === "home";
  const links = isHome ? HOME_LINKS : HUB_LINKS;

  el.innerHTML = `
    <a class="pg-logo" href="/agent" aria-label="Concierge Agent home">
      <img class="el-logo" src="/images/the-concierge-logo.png" alt="" width="36" height="36" />
      <span>Concierge<span class="pg-logo-dim"> Agent</span></span>
    </a>
    <div class="pg-nav-wrap">
      <nav class="pg-nav" aria-label="Concierge Agent">
        ${links.map((l) => navLink(l, activeId)).join("")}
      </nav>
      ${moreMenu(activeId)}
    </div>
    <div class="pg-topnav-right">
      <a class="pg-lounge-btn" href="/lounge" title="Executive Lounge">Lounge</a>
      <div class="el-status-pill" title="x402 pay-per-call API">
        <span class="dot"></span> Live
      </div>
      <div class="el-theme-toggle theme-toggle" role="group" aria-label="Theme mode">
        <button type="button" class="theme-btn" data-theme-btn="dark">Dark</button>
        <button type="button" class="theme-btn" data-theme-btn="light">Light</button>
      </div>
    </div>`;

  bindThemeToggle(el);
  bindMoreMenu(el);
}
