(function () {
  var NAV = [
    { label: "Start", items: [
      { id: "introduction", href: "/docs", title: "Welcome to Concierge" },
      { id: "quickstart", href: "/docs/quickstart", title: "Quickstart" },
      { id: "pricing", href: "/docs/pricing", title: "Pricing" },
    ]},
    { label: "Payment", items: [
      { id: "payment-x402", href: "/docs/payment/x402", title: "x402 Protocol" },
    ]},
    { label: "API Reference", items: [
      { id: "api-overview", href: "/docs/api/overview", title: "API Overview" },
      { id: "api-concierge", href: "/docs/api/concierge", title: "Concierge Chat" },
      { id: "api-intel", href: "/docs/api/intel", title: "DeFi Intel" },
      { id: "api-agent-identity", href: "/docs/api/agent-identity", title: "Agent Identity" },
      { id: "api-lounge", href: "/docs/api/lounge", title: "Lounge & Signals" },
    ]},
    { label: "Concierge Agent", items: [
      { id: "agent-endpoints", href: "/agent/endpoints", title: "Endpoints" },
      { id: "agent-playground", href: "/agent/playground", title: "Playground" },
      { id: "agent-discover", href: "/agent/discover", title: "Discover" },
    ]},
    { label: "Product", items: [
      { id: "playground", href: "/docs/playground", title: "Executive Lounge" },
      { id: "architecture", href: "/docs/architecture", title: "Architecture" },
    ]},
  ];

  var LEGACY = {
    "api-agents": "api-concierge",
    agents: "api-concierge",
    intel: "api-intel",
    "agent-identity": "api-agent-identity",
  };

  function currentPageId() {
    var root = document.querySelector("[data-docs-page]");
    var id = root && root.getAttribute("data-docs-page");
    if (id && LEGACY[id]) return LEGACY[id];
    return id || "introduction";
  }

  function renderSidebar() {
    var aside = document.getElementById("docs-sidebar");
    if (!aside) return;
    var page = currentPageId();
    var html =
      '<div class="docs-sidebar-brand"><a href="/">' +
      '<img src="/images/the-concierge-logo.png" alt="" width="32" height="32" />' +
      "<div><span>Concierge</span><small>Executive Lounge</small></div></a></div>" +
      '<button type="button" class="docs-mobile-toggle" id="docs-nav-toggle" aria-expanded="true">Menu</button>' +
      '<nav class="docs-nav" id="docs-nav" aria-label="Documentation">';
    NAV.forEach(function (group) {
      html += '<div class="docs-nav-group"><div class="docs-nav-label">' + group.label + "</div>";
      group.items.forEach(function (item) {
        var cls = item.id === page ? " active" : "";
        html +=
          '<a class="' +
          cls.trim() +
          '" href="' +
          item.href +
          '">' +
          item.title +
          "</a>";
      });
      html += "</div>";
    });
    html += "</nav>";
    aside.innerHTML = html;
    var toggle = document.getElementById("docs-nav-toggle");
    var nav = document.getElementById("docs-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var collapsed = nav.classList.toggle("collapsed");
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderSidebar);
  } else {
    renderSidebar();
  }
})();
