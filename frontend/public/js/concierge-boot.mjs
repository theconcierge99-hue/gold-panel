/**
 * Dismiss branded boot shell once DOM is ready.
 */
function dismissBoot() {
  const root = document.documentElement;
  const boot = document.getElementById("concierge-boot");
  if (!boot) {
    root.classList.remove("concierge-booting");
    return;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const finish = () => {
    boot.remove();
    root.classList.remove("concierge-booting");
    root.classList.add("concierge-boot-done");
    document.body.style.removeProperty("overflow");
  };

  if (reduced) {
    finish();
    return;
  }

  boot.classList.add("concierge-boot-out");
  root.classList.add("concierge-boot-done");
  boot.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 520);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(dismissBoot));
} else {
  requestAnimationFrame(dismissBoot);
}
