/**
 * Hero particle field — Concierge logo pixels assemble into a living dot-matrix icon.
 */
export function initConciergeLogoParticles(canvas) {
  if (!canvas) return () => {};
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
        if (a < 50 || lum < 38) continue;
        const goldish = r > 120 && g > 85 && b < 170;
        const tx = x - size / 2;
        const ty = y - size / 2;
        const spread = 340 + Math.random() * 160;
        const ang = Math.random() * Math.PI * 2;
        particles.push({
          tx,
          ty,
          x: Math.cos(ang) * spread,
          y: Math.sin(ang) * spread,
          size: goldish ? 3.4 : 2.4,
          gold: goldish || lum > 140,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  function drawScale(w, h) {
    return Math.min(w * 0.62, h * 0.78, 520) / 180;
  }

  function draw(now) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.34;
    const scale = drawScale(w, h);
    const elapsed = (now - t0) / 1000;
    const assemble = Math.min(1, elapsed / 2.4);
    const ease = 1 - (1 - assemble) ** 3;

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
      if (p.gold) {
        ctx.fillStyle = `rgba(201,168,76,${0.62 + 0.38 * pulse})`;
      } else {
        ctx.fillStyle = `rgba(210,218,230,${0.32 + 0.42 * pulse})`;
      }
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

/** Matrix-style code rain (gold-tinted). */
export function initMatrixRain(canvas) {
  if (!canvas) return () => {};
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
    ctx.fillStyle = "rgba(5,6,8,0.08)";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.font = `${fontSize}px DM Mono, monospace`;

    for (let i = 0; i < cols.length; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const x = i * fontSize;
      const y = cols[i] * fontSize;
      const gold = Math.random() > 0.92;
      ctx.fillStyle = gold ? "rgba(201,168,76,0.35)" : "rgba(60,80,60,0.22)";
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
