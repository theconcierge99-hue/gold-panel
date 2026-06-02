/** Shared top nav for Concierge Agent hub pages. */
export function renderAgentTopNav(activeId) {
  const el = document.getElementById("agent-topnav");
  if (!el) return;

  const links = [
    { id: "home", href: "/agent", label: "Home" },
    { id: "endpoints", href: "/agent/endpoints", label: "Endpoints" },
    { id: "playground", href: "/agent/playground", label: "Playground" },
    { id: "discover", href: "/agent/discover", label: "Discover" },
    { id: "identity", href: "/agent/identity", label: "Identity" },
    { id: "docs", href: "/docs", label: "Docs" },
    { id: "lounge", href: "/", label: "Lounge" },
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
