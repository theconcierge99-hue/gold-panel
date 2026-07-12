(function () {
  function markPremium() {
    document.body.classList.add("el-premium", "docs-v2");
  }
  if (document.body) markPremium();
  else document.addEventListener("DOMContentLoaded", markPremium);

  var NAV = [
    { label: "Start", items: [
      { id: "introduction", href: "/docs", title: "Welcome to Concierge" },
      { id: "builders", href: "/docs/builders", title: "For Builders" },
      { id: "builders-case-study", href: "/docs/builders/case-study", title: "B2B Case Study" },
      { id: "quickstart", href: "/docs/quickstart", title: "Quickstart" },
      { id: "pricing", href: "/docs/pricing", title: "Pricing" },
      { id: "launch", href: "/docs/launch", title: "TCX Launch" },
    ]},
    { label: "Payment", items: [
      { id: "payment-x402", href: "/docs/payment/x402", title: "x402 Protocol" },
      { id: "payment-token-pay", href: "/docs/payment/token-pay", title: "Token Pay (Beta)" },
      { id: "payment-mpp", href: "/docs/payment/mpp", title: "MPP & AgentCash" },
      { id: "payment-paysh", href: "/docs/payment/paysh", title: "pay.sh" },
    ]},
    { label: "Integrations", items: [
      { id: "integration-dexter", href: "/docs/integration/dexter", title: "Dexter & OpenDexter" },
      { id: "integration-payai", href: "/docs/integration/payai", title: "PayAI" },
      { id: "integration-x402scan", href: "/docs/integration/x402scan", title: "x402scan" },
      { id: "integration-mcp-registry", href: "/docs/integration/mcp-registry", title: "MCP Registry" },
      { id: "integration-poncho", href: "/docs/integration/poncho", title: "Poncho" },
      { id: "integration-hyre", href: "/docs/integration/hyre", title: "HYRE Gateway" },
      { id: "integration-anthropic", href: "/docs/integration/anthropic", title: "Anthropic Claude" },
      { id: "integration-oobe", href: "/docs/integration/oobe", title: "OOBE Protocol" },
      { id: "integration-zauth", href: "/docs/integration/zauth", title: "zauth" },
      { id: "integration-privy", href: "/docs/integration/privy", title: "Privy" },
      { id: "integration-mpp", href: "/docs/payment/mpp", title: "MPPscan" },
      { id: "integration-paysh", href: "/docs/payment/paysh", title: "pay.sh" },
      { id: "corbits", href: "/docs/corbits", title: "Corbits" },
      { id: "grok-build", href: "/docs/grok-build", title: "Grok Build" },
      { id: "integration-metaplex", href: "/docs/integration/metaplex", title: "Metaplex" },
      { id: "integration-agent-card", href: "/docs/integration/agent-card", title: "Agent Card (A2A)" },
    ]},
    { label: "API Reference", items: [
      { id: "api-overview", href: "/docs/api/overview", title: "API Overview" },
      { id: "api-concierge", href: "/docs/api/concierge", title: "Concierge Chat" },
      { id: "api-intel", href: "/docs/api/intel", title: "Intel APIs" },
      { id: "api-security", href: "/docs/api/security", title: "Security Desk" },
      { id: "api-agent-identity", href: "/docs/api/agent-identity", title: "Agent Identity" },
      { id: "api-agent-readiness", href: "/docs/api/agent-readiness", title: "Agent Readiness" },
      { id: "api-lounge", href: "/docs/api/lounge", title: "Lounge & Signals" },
    ]},
    { label: "Concierge Agent", items: [
      { id: "agent-endpoints", href: "/agent/endpoints", title: "Endpoints" },
      { id: "agent-playground", href: "/agent/playground", title: "Playground" },
      { id: "agent-discover", href: "/agent/discover", title: "Discover" },
      { id: "agent-skills", href: "/agent/skills", title: "Agent Skills" },
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
    security: "api-security",
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
      '<div class="docs-sidebar-brand"><a href="/agent">' +
      '<img class="el-logo" src="/images/the-concierge-logo.png" alt="" width="40" height="40" />' +
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
    document.addEventListener("DOMContentLoaded", function () {
      renderSidebar();
      initDocsReveal();
    });
  } else {
    renderSidebar();
    initDocsReveal();
  }

  function initDocsReveal() {
    [".docs-title", ".docs-lead", ".doc-card", ".card-grid", "h2.docs-h2", ".docs-content .card"].forEach(
      function (sel) {
        document.querySelectorAll(sel).forEach(function (el) {
          el.classList.add("el-reveal");
        });
      },
    );
    import("/js/concierge-fx.mjs")
      .then(function (m) {
        m.initScrollReveal();
      })
      .catch(function () {});
  }
})();
