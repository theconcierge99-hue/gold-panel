/**
 * Concierge FX — lightweight premium interactions (parallax, scroll reveal).
 * No dependencies. Respects prefers-reduced-motion.
 */

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Subtle mouse parallax on ambient layer (Executive Lounge). */
export function initAmbientParallax(root = document.querySelector(".ambient")) {
  if (!root || reduced) return () => {};

  let raf = 0;
  let tx = 0;
  let ty = 0;

  const onMove = (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 24;
    ty = (e.clientY / window.innerHeight - 0.5) * 16;
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty("--el-px", `${tx}px`);
        root.style.setProperty("--el-py", `${ty}px`);
      });
    }
  };

  window.addEventListener("mousemove", onMove, { passive: true });
  return () => {
    window.removeEventListener("mousemove", onMove);
    if (raf) cancelAnimationFrame(raf);
    root.style.removeProperty("--el-px");
    root.style.removeProperty("--el-py");
  };
}

/** Fade-up elements as they enter the viewport. */
export function initScrollReveal(selector = ".el-reveal") {
  if (reduced) return () => {};

  const els = document.querySelectorAll(selector);
  if (!els.length) return () => {};

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );

  els.forEach((el) => {
    if (!el.classList.contains("el-reveal")) el.classList.add("el-reveal");
    io.observe(el);
  });
  return () => io.disconnect();
}

/** Gentle float on hero content (Agent hub). */
export function initHeroFloat(el = document.querySelector(".agent-hero-content")) {
  if (!el || reduced) return () => {};

  let t = 0;
  let raf = 0;
  const tick = () => {
    t += 0.012;
    const y = Math.sin(t) * 4;
    el.style.transform = `translateY(${y}px)`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    el.style.transform = "";
  };
}

/** Call from page entry modules. */
export function initConciergeFx() {
  const stops = [
    initAmbientParallax(),
    initScrollReveal(".el-reveal"),
    initScrollReveal(".section-h:not(.el-reveal)"),
    initHeroFloat(),
  ];
  return () => stops.forEach((s) => s?.());
}
