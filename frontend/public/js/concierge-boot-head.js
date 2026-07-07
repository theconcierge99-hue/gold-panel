/**
 * Early boot shell — run synchronously in <head> on docs/about surfaces.
 * Full styles: concierge-boot.css (via premium/docs-site import).
 * Dismiss: concierge-boot.mjs
 */
(function () {
  var root = document.documentElement;
  if (root.classList.contains("concierge-booting")) return;
  root.classList.add("concierge-booting");

  var critical = document.createElement("style");
  critical.id = "concierge-boot-critical";
  critical.textContent =
    "html.concierge-booting body{overflow:hidden}" +
    "html.concierge-booting body>:not(#concierge-boot){opacity:0}" +
    "#concierge-boot{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#060810;transition:opacity .45s cubic-bezier(.22,1,.36,1),visibility .45s cubic-bezier(.22,1,.36,1)}" +
    'html[data-theme="light"] #concierge-boot{background:#f4f1ea}' +
    "#concierge-boot .concierge-boot-inner{display:flex;flex-direction:column;align-items:center;gap:18px}" +
    "#concierge-boot img{width:56px;height:56px;object-fit:contain}" +
    '#concierge-boot .concierge-boot-brand{font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;letter-spacing:.22em;color:#f0ece4;font-weight:400}' +
    'html[data-theme="light"] #concierge-boot .concierge-boot-brand{color:#0a1018}' +
    "#concierge-boot .concierge-boot-brand em{font-style:normal;color:#c9a84c}" +
    "#concierge-boot .concierge-boot-pulse{width:48px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,#c9a84c,transparent);opacity:.7;animation:concierge-boot-pulse 1.4s ease-in-out infinite}" +
    "@keyframes concierge-boot-pulse{0%,100%{opacity:.35;transform:scaleX(.65)}50%{opacity:1;transform:scaleX(1)}}" +
    "#concierge-boot.concierge-boot-out{opacity:0;visibility:hidden;pointer-events:none}" +
    "html.concierge-booting.concierge-boot-done body>:not(#concierge-boot){opacity:1;transition:opacity .35s ease .05s}";
  document.head.appendChild(critical);

  function mount() {
    if (document.getElementById("concierge-boot")) return;
    var el = document.createElement("div");
    el.id = "concierge-boot";
    el.className = "concierge-boot";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Loading Concierge");
    el.innerHTML =
      '<div class="concierge-boot-inner">' +
      '<img src="/images/the-concierge-logo.png" alt="" width="56" height="56" />' +
      '<span class="concierge-boot-brand">CONCIERGE<em>_</em></span>' +
      '<span class="concierge-boot-pulse" aria-hidden="true"></span>' +
      "</div>";
    document.body.insertBefore(el, document.body.firstChild);
  }

  function loadDismiss() {
    if (document.querySelector('script[data-concierge-boot-dismiss]')) return;
    var s = document.createElement("script");
    s.type = "module";
    s.src = "/js/concierge-boot.mjs";
    s.setAttribute("data-concierge-boot-dismiss", "1");
    document.head.appendChild(s);
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadDismiss);
  } else {
    loadDismiss();
  }
})();
