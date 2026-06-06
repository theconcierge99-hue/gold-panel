/** Lounge-style site footer: Integrations, About Us, X + Telegram. */
export function renderAgentSiteFooter(containerId = "agent-site-footer") {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <div class="agent-site-footer">
      <div class="agent-foot-row">
        <nav class="agent-foot-links" aria-label="Site links">
          <a class="agent-foot-link" href="/integrations">Integrations</a>
          <span class="agent-foot-dot" aria-hidden="true">·</span>
          <a class="agent-foot-link" href="/about" target="_blank" rel="noopener noreferrer">About Us</a>
        </nav>
        <span class="agent-foot-divider" aria-hidden="true"></span>
        <div class="agent-foot-social">
          <a class="agent-foot-social-btn" href="https://x.com/Th3concierge_" target="_blank" rel="noopener noreferrer" aria-label="Follow on X @Th3concierge_">
            <img src="/images/x-social.png" alt="" width="16" height="16" />
          </a>
          <a class="agent-foot-social-btn agent-foot-social-btn--telegram" href="https://t.me/Theconcierge33" target="_blank" rel="noopener noreferrer" aria-label="Telegram @Theconcierge33">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          </a>
        </div>
      </div>
      <p class="agent-foot-tag">Concierge Agent · Executive Lounge</p>
    </div>`;
}

/** Shared top nav for Concierge Agent hub pages. */
export function renderAgentTopNav(activeId) {
  const el = document.getElementById("agent-topnav");
  if (!el) return;

  const links = [
    { id: "home", href: "/agent", label: "Home" },
    { id: "endpoints", href: "/agent/endpoints", label: "Endpoints" },
    { id: "playground", href: "/agent/playground", label: "Playground" },
    { id: "discover", href: "/agent/discover", label: "Discover" },
    { id: "builders", href: "/docs/builders", label: "Builders" },
    { id: "identity", href: "/agent/identity", label: "Identity" },
    { id: "lounge", href: "/lounge", label: "Lounge" },
    { id: "concierge", href: "/lounge#concierge", label: "Concierge AI" },
    { id: "docs", href: "/docs", label: "Docs" },
  ];

  el.innerHTML = `
    <a class="pg-logo" href="/agent">
      <img src="/images/the-concierge-logo.png" alt="" width="28" height="28" />
      <span>CONCIERGE<span class="pg-logo-dim">_</span></span>
    </a>
    <nav class="pg-nav" aria-label="Concierge Agent">
      ${links
        .map((l) => {
          const cls = l.id === activeId ? " active" : "";
          return `<a href="${l.href}" class="${cls.trim()}">${l.label}</a>`;
        })
        .join("")}
    </nav>
    <div class="pg-topnav-right">
      <button type="button" class="pg-theme-btn" id="pg-theme-toggle" aria-label="Toggle theme">◐</button>
    </div>`;

  el.querySelector("#pg-theme-toggle")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("el-theme", next);
  });
}
