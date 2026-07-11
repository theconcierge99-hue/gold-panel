/**
 * Hero particle field — Concierge logo pixels assemble into a living dot-matrix icon.
 */
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initConciergeLogoParticles(canvas) {
  if (!canvas || reduced) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let particles = [];
  let raf = 0;
  let t0 = performance.now();
  const img = new Image();
  img.crossOrigin = "anonymous";

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const LOGO_SRC = 360;
  const LOGO_HALF = LOGO_SRC / 2;

  function isLightTheme() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function particleFill(gold, pulse) {
    if (isLightTheme()) {
      if (gold) return `rgba(74,58,14,${0.62 + 0.28 * pulse})`;
      return `rgba(58,74,94,${0.42 + 0.38 * pulse})`;
    }
    if (gold) return `rgba(232,200,104,${0.72 + 0.28 * pulse})`;
    return `rgba(210,218,230,${0.4 + 0.48 * pulse})`;
  }

  /** Fit logo — panel watermark vs legacy tall hero canvas. */
  function logoMetrics(w, h) {
    const inPanel = canvas.classList.contains("agent-demo-logo-canvas");
    if (inPanel) {
      const pad = 20;
      const maxDiam = Math.min(w - pad * 2, h - pad * 2, 280);
      const scale = maxDiam / LOGO_SRC;
      return { cx: w / 2, cy: h * 0.46, scale, maxDiam };
    }
    const padX = 36;
    const padTop = 44;
    const textBlock = Math.min(300, h * 0.36);
    const footer = 52;
    const availW = w - padX * 2;
    const availH = h - padTop - textBlock - footer;
    const maxDiam = Math.min(availW * 0.92, availH * 0.98, 520);
    const scale = maxDiam / LOGO_SRC;
    const radius = LOGO_HALF * scale;
    const cx = w / 2;
    const cy = padTop + radius;
    return { cx, cy, scale, maxDiam };
  }

  function buildParticles() {
    particles = [];
    const size = 360;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.drawImage(img, 0, 0, size, size);
    const data = octx.getImageData(0, 0, size, size).data;
    const step = 2;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const i = (y * size + x) * 4;
        const a = data[i + 3];
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (a < 50 || lum < 42) continue;
        const neutralBg =
          Math.abs(r - g) < 22 && Math.abs(g - b) < 22 && lum < 110;
        if (neutralBg) continue;
        const goldish = r > 120 && g > 85 && b < 170;
        const tx = x - size / 2;
        const ty = y - size / 2;
        const spread = 320 + Math.random() * 140;
        const ang = Math.random() * Math.PI * 2;
        particles.push({
          tx,
          ty,
          x: Math.cos(ang) * spread,
          y: Math.sin(ang) * spread,
          size: goldish ? 3.8 : 2.7,
          gold: goldish || lum > 140,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  function draw(now) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const { cx, cy, scale, maxDiam } = logoMetrics(w, h);
    const elapsed = (now - t0) / 1000;
    const assemble = Math.min(1, elapsed / 2.4);
    const ease = 1 - (1 - assemble) ** 3;
    const inPanel = canvas.classList.contains("agent-demo-logo-canvas");

    if (!inPanel && isLightTheme()) {
      const glowR = (maxDiam / 2) * 1.08;
      const g = ctx.createRadialGradient(cx, cy, glowR * 0.15, cx, cy, glowR);
      g.addColorStop(0, "rgba(255,255,255,0.92)");
      g.addColorStop(0.55, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of particles) {
      const jx = Math.sin(elapsed * 1.2 + p.phase) * (1 - ease) * 2.5;
      const jy = Math.cos(elapsed * 0.9 + p.phase) * (1 - ease) * 2.5;
      const tx = p.tx * scale;
      const ty = p.ty * scale;
      const x = cx + p.x * (1 - ease) * scale + tx * ease + jx;
      const y = cy + p.y * (1 - ease) * scale + ty * ease + jy;
      const pulse = 0.78 + 0.22 * Math.sin(elapsed * 2 + p.phase);
      const dotR = p.size * scale * 0.42 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = particleFill(p.gold, pulse);
      ctx.fill();
    }

    raf = requestAnimationFrame(draw);
  }

  function onLoad() {
    buildParticles();
    resize();
    raf = requestAnimationFrame(draw);
  }

  img.onload = onLoad;
  img.src = "/images/the-concierge-logo.png";
  if (img.complete) onLoad();

  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
  };
}

/** Mouse parallax on agent landing ambient layer. */
export function initAgentAmbientParallax(root = document.querySelector(".agent-ambient")) {
  if (!root || reduced) return () => {};

  let raf = 0;
  let tx = 0;
  let ty = 0;

  const onMove = (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 28;
    ty = (e.clientY / window.innerHeight - 0.5) * 18;
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty("--el-px", `${tx}px`);
        root.style.setProperty("--el-py", `${ty}px`);
        root.style.setProperty("--el-orb-gx", `${tx * 0.6}px`);
        root.style.setProperty("--el-orb-gy", `${ty * 0.5}px`);
        root.style.setProperty("--el-orb-bx", `${-tx * 0.4}px`);
        root.style.setProperty("--el-orb-by", `${-ty * 0.35}px`);
      });
    }
  };

  window.addEventListener("mousemove", onMove, { passive: true });
  return () => {
    window.removeEventListener("mousemove", onMove);
    if (raf) cancelAnimationFrame(raf);
    for (const key of ["--el-px", "--el-py", "--el-orb-gx", "--el-orb-gy", "--el-orb-bx", "--el-orb-by"]) {
      root.style.removeProperty(key);
    }
  };
}

/** Count-up number for live metrics. */
export function animateCount(el, target, { duration = 1200, delay = 0 } = {}) {
  if (!el) return () => {};
  const end = Number(target);
  if (!Number.isFinite(end)) {
    el.textContent = String(target);
    return () => {};
  }
  if (reduced) {
    el.textContent = String(end);
    return () => {};
  }

  let raf = 0;
  let timer = 0;
  const start = performance.now() + delay;

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    if (t < 0) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const eased = 1 - (1 - t) ** 3;
    el.textContent = String(Math.round(end * eased));
    if (t < 1) raf = requestAnimationFrame(tick);
    else el.textContent = String(end);
  };

  el.textContent = "0";
  timer = window.setTimeout(() => {
    raf = requestAnimationFrame(tick);
  }, delay);

  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}

/** Count-up percentage text (e.g. 87 → "87%"). */
export function animatePercent(el, pct, { duration = 1000, delay = 0 } = {}) {
  if (!el) return () => {};
  const end = Number(pct);
  if (!Number.isFinite(end)) {
    el.textContent = String(pct);
    return () => {};
  }
  if (reduced) {
    el.textContent = `${end}%`;
    return () => {};
  }

  let raf = 0;
  let timer = 0;
  const start = performance.now() + delay;

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    if (t < 0) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const eased = 1 - (1 - t) ** 3;
    el.textContent = `${Math.round(end * eased)}%`;
    if (t < 1) raf = requestAnimationFrame(tick);
    else el.textContent = `${end}%`;
  };

  el.textContent = "0%";
  timer = window.setTimeout(() => {
    raf = requestAnimationFrame(tick);
  }, delay);

  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}

/** Matrix-style code rain (gold-tinted). */
export function initMatrixRain(canvas) {
  if (!canvas || reduced) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const chars = "01アイウエオカキクケコサシスセソ0123456789ABCDEF";
  let cols = [];
  let raf = 0;
  let fontSize = 14;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fontSize = Math.max(12, Math.floor(rect.width / 90));
    const colCount = Math.ceil(rect.width / fontSize);
    cols = Array.from({ length: colCount }, () => Math.random() * -40);
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const light = document.documentElement.getAttribute("data-theme") === "light";
    ctx.fillStyle = light ? "rgba(244,242,236,0.12)" : "rgba(5,6,8,0.08)";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.font = `${fontSize}px DM Mono, monospace`;

    for (let i = 0; i < cols.length; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const x = i * fontSize;
      const y = cols[i] * fontSize;
      const gold = Math.random() > 0.92;
      if (light) {
        ctx.fillStyle = gold ? "rgba(107,82,24,0.28)" : "rgba(58,74,94,0.16)";
      } else {
        ctx.fillStyle = gold ? "rgba(201,168,76,0.35)" : "rgba(60,80,60,0.22)";
      }
      ctx.fillText(ch, x, y);
      if (y > rect.height && Math.random() > 0.975) cols[i] = 0;
      cols[i] += 0.4 + Math.random() * 0.6;
    }
    raf = requestAnimationFrame(draw);
  }

  resize();
  raf = requestAnimationFrame(draw);
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
  };
}

export function initTypewriter(el, phrases, intervalMs = 4200) {
  if (!el || !phrases.length) return () => {};
  let pi = 0;
  let ci = 0;
  let deleting = false;
  let timer = 0;

  function tick() {
    const phrase = phrases[pi];
    if (!deleting) {
      ci++;
      el.textContent = phrase.slice(0, ci);
      if (ci >= phrase.length) {
        deleting = true;
        timer = window.setTimeout(tick, 1400);
        return;
      }
    } else {
      ci--;
      el.textContent = phrase.slice(0, ci);
      if (ci <= 0) {
        deleting = false;
        pi = (pi + 1) % phrases.length;
      }
    }
    timer = window.setTimeout(tick, deleting ? 28 : 42);
  }

  tick();
  return () => clearTimeout(timer);
}

/** Payment-flow terminal demo — command then x402 settlement status. */
export function initAgentTerminalDemo(cmdEl, statusEl, origin = "", panelEl = null) {
  if (!cmdEl) return () => {};

  const panel = panelEl || cmdEl.closest(".agent-demo-panel");
  const host = origin.replace(/\/$/, "") || "https://conc-exe.xyz";
  const scenarios = [
    {
      cmd: `pay curl ${host}/api/resource-chat -d '{"message":"BTC outlook"}'`,
      status: "→ 402 Payment Required · USDC $0.05 or TCX · Solana",
      ok: "✔ x402 settled · 200 · agent reply ready",
    },
    {
      cmd: `pay curl ${host}/api/concierge-intel-macro -d '{}'`,
      status: "→ 402 Payment Required · USDC $0.02 · Arbitrum",
      ok: "✔ x402 settled · 200 · macro brief ready",
    },
    {
      cmd: `curl -s ${host}/api/resources`,
      status: "→ 200 · Concierge Resources catalog",
      ok: "✔ 24 pay-per-call routes · intel + creative",
    },
    {
      cmd: `npx agentcash add ${host}`,
      status: "→ AgentCash catalog · conc-exe/concierge-agent",
      ok: "✔ Ready for pay-per-call agent probes",
    },
  ];

  let si = 0;
  let phase = "type";
  let ci = 0;
  let timer = 0;
  let settleTimer = 0;
  let payTimer = 0;

  function clearPanelFx() {
    panel?.classList.remove("is-paying", "is-settled");
    clearTimeout(settleTimer);
    clearTimeout(payTimer);
  }

  function setStatus(text, ok = false) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("ok", ok);
    if (!panel || reduced) return;
    if (ok) {
      panel.classList.remove("is-paying");
      panel.classList.add("is-settled");
      settleTimer = window.setTimeout(() => panel.classList.remove("is-settled"), 1400);
      return;
    }
    if (text.includes("402")) {
      panel.classList.remove("is-settled");
      panel.classList.add("is-paying");
      payTimer = window.setTimeout(() => panel.classList.remove("is-paying"), 2000);
    }
  }

  function tick() {
    const s = scenarios[si];
    if (phase === "type") {
      ci++;
      cmdEl.textContent = s.cmd.slice(0, ci);
      if (ci >= s.cmd.length) {
        phase = "status";
        setStatus(s.status, false);
        timer = window.setTimeout(tick, 1800);
        return;
      }
      timer = window.setTimeout(tick, 18);
      return;
    }
    if (phase === "status") {
      setStatus(s.ok, true);
      phase = "hold";
      timer = window.setTimeout(tick, 2400);
      return;
    }
    si = (si + 1) % scenarios.length;
    phase = "type";
    ci = 0;
    setStatus("", false);
    cmdEl.textContent = "";
    timer = window.setTimeout(tick, 400);
  }

  tick();
  return () => {
    clearTimeout(timer);
    clearPanelFx();
  };
}

/** Inline micro-icon markup for about pillar cards. */
export function getPillarIconHtml(type) {
  switch (type) {
    case "intel":
      return `<span class="agent-pillar-icon agent-pillar-icon--intel" aria-hidden="true">
        <svg viewBox="0 0 48 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polyline class="agent-pillar-spark" points="2,22 11,13 19,17 27,7 36,11 44,3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>`;
    case "security":
      return `<span class="agent-pillar-icon agent-pillar-icon--security" aria-hidden="true">
        <span class="agent-pillar-scan-frame"></span>
        <span class="agent-pillar-scan-line"></span>
      </span>`;
    case "x402":
      return `<span class="agent-pillar-icon agent-pillar-icon--x402" aria-hidden="true">
        <span class="agent-pillar-flip">
          <span class="agent-pillar-flip-face agent-pillar-flip-face--a">402</span>
          <span class="agent-pillar-flip-face agent-pillar-flip-face--b">200</span>
        </span>
      </span>`;
    case "mesh":
      return `<span class="agent-pillar-icon agent-pillar-icon--mesh" aria-hidden="true">
        <svg viewBox="0 0 48 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line class="agent-mesh-link agent-mesh-link--ab" x1="10" y1="16" x2="24" y2="9" stroke="currentColor" stroke-width="1.5"/>
          <line class="agent-mesh-link agent-mesh-link--bc" x1="24" y1="9" x2="38" y2="18" stroke="currentColor" stroke-width="1.5"/>
          <line class="agent-mesh-link agent-mesh-link--ac" x1="10" y1="16" x2="38" y2="18" stroke="currentColor" stroke-width="1.5"/>
          <circle class="agent-mesh-node" cx="10" cy="16" r="3.5" fill="currentColor"/>
          <circle class="agent-mesh-node agent-mesh-node--b" cx="24" cy="9" r="3.5" fill="currentColor"/>
          <circle class="agent-mesh-node agent-mesh-node--c" cx="38" cy="18" r="3.5" fill="currentColor"/>
        </svg>
      </span>`;
    default:
      return "";
  }
}

/** Staggered fade-up for card grids when they enter the viewport. */
export function initStaggerReveal(containerEl, { itemSelector = ".el-reveal-item", baseDelay = 80 } = {}) {
  if (!containerEl) return () => {};

  const items = [...containerEl.querySelectorAll(itemSelector)];
  if (!items.length) return () => {};

  if (reduced) {
    items.forEach((el) => el.classList.add("is-visible"));
    return () => {};
  }

  const timers = [];
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        items.forEach((el, i) => {
          timers.push(
            window.setTimeout(() => el.classList.add("is-visible"), i * baseDelay),
          );
        });
        io.disconnect();
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );

  io.observe(containerEl);
  return () => {
    io.disconnect();
    timers.forEach((t) => clearTimeout(t));
  };
}

/** Metrics band accents — price shimmer + API keys emphasis flash. */
export function initMetricsBandFx(sectionEl) {
  if (!sectionEl) return () => {};

  const priceEl = sectionEl.querySelector("#agent-metric-price");
  const keysEl = sectionEl.querySelector("#agent-metric-keys");
  let fired = false;

  const run = () => {
    if (fired) return;
    fired = true;
    priceEl?.classList.add("is-active");
    if (keysEl && !reduced) {
      window.setTimeout(() => {
        keysEl.classList.add("is-keys-flash");
        window.setTimeout(() => keysEl.classList.remove("is-keys-flash"), 2200);
      }, 800);
    }
  };

  if (reduced) {
    priceEl?.classList.add("is-active");
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run();
        io.disconnect();
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -30px 0px" },
  );

  io.observe(sectionEl);
  return () => io.disconnect();
}

/** Subtle border glow on CTA band when scrolled into view. */
export function initCtaGlow(el) {
  if (!el) return () => {};

  if (reduced) {
    el.classList.add("is-glowing");
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        el.classList.add("is-glowing");
        io.disconnect();
      }
    },
    { threshold: 0.35 },
  );

  io.observe(el);
  return () => io.disconnect();
}
