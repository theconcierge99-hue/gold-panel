/**
 * Executive Lounge — analog market desk clocks (client-only, no API).
 */
const CLOCKS = [
  { id: "utc", label: "UTC", tz: "UTC", sub: "Desk" },
  { id: "nyc", label: "New York", tz: "America/New_York", sub: "US · ET", session: "us" },
  { id: "lon", label: "London", tz: "Europe/London", sub: "EU · GMT", session: "eu" },
  { id: "sgp", label: "Singapore", tz: "Asia/Singapore", sub: "APAC", session: "asia" },
];

const SESSIONS = [
  { id: "asia", label: "Asia", openUtc: [0, 8] },
  { id: "eu", label: "Europe", openUtc: [7, 16] },
  { id: "us", label: "United States", openUtc: [14, 21] },
  { id: "crypto", label: "Crypto peak", openUtc: [13, 21], gold: true },
];

const SIZE = 112;
const CX = SIZE / 2;
const CY = SIZE / 2;
/** Clip + max hand reach — inside hour ticks (outer tick at r-3 from center). */
const DIAL_R = 50;
const HAND = { hour: 21, minute: 35, second: 38 };

function partsInTz(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(get("hour"));
  return {
    hour: hour >= 24 ? 0 : hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function isWeekday(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const wd = fmt.format(date);
  return wd !== "Sat" && wd !== "Sun";
}

function minsLocal(date, tz) {
  const p = partsInTz(date, tz);
  return p.hour * 60 + p.minute;
}

function isUsOpen(date) {
  if (!isWeekday(date, "America/New_York")) return false;
  const m = minsLocal(date, "America/New_York");
  return m >= 570 && m < 960;
}

function isEuOpen(date) {
  if (!isWeekday(date, "Europe/London")) return false;
  const m = minsLocal(date, "Europe/London");
  return m >= 480 && m < 990;
}

function isAsiaOpen(date) {
  if (!isWeekday(date, "Asia/Singapore")) return false;
  const m = minsLocal(date, "Asia/Singapore");
  return m >= 540 && m < 900;
}

function isUtcRangeOpen(date, startH, endH) {
  const h = date.getUTCHours() + date.getUTCMinutes() / 60;
  return h >= startH && h < endH;
}

function sessionOpen(id, date) {
  if (id === "us") return isUsOpen(date);
  if (id === "eu") return isEuOpen(date);
  if (id === "asia") return isAsiaOpen(date);
  if (id === "crypto") return isUtcRangeOpen(date, 13, 21);
  return false;
}

function digitalTime(date, tz) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function digitalDate(date, tz) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Angles in degrees clockwise from 12 o'clock — matches real analog clocks. */
function clockAngles(date, tz, msFrac = 0) {
  const p = partsInTz(date, tz);
  const s = p.second + msFrac / 1000;
  const m = p.minute + s / 60;
  const h = (p.hour % 12) + m / 60;
  return {
    hour: h * 30,
    minute: m * 6,
    second: s * 6,
  };
}

function handPolygon(cx, cy, length, halfWidth) {
  const hw = halfWidth;
  const tail = 5;
  return `M ${cx - hw} ${cy + tail}
    L ${cx + hw} ${cy + tail}
    L ${cx + hw * 0.35} ${cy - length}
    L ${cx - hw * 0.35} ${cy - length} Z`;
}

function svgClock(id) {
  const uid = `clk-${id}`;

  const marks = Array.from({ length: 60 }, (_, i) => {
    const a = ((i * 6 - 90) * Math.PI) / 180;
    const major = i % 5 === 0;
    const inner = major ? DIAL_R - 4 : DIAL_R - 2;
    const outer = DIAL_R;
    const x1 = CX + inner * Math.cos(a);
    const y1 = CY + inner * Math.sin(a);
    const x2 = CX + outer * Math.cos(a);
    const y2 = CY + outer * Math.sin(a);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="clk-mark${major ? " major" : ""}"/>`;
  }).join("");

  const numerals = [12, 3, 6, 9]
    .map((n, idx) => {
      const a = ((idx * 90 - 90) * Math.PI) / 180;
      const x = CX + (DIAL_R - 10) * Math.cos(a);
      const y = CY + (DIAL_R - 10) * Math.sin(a) + 3.5;
      return `<text x="${x}" y="${y}" class="clk-num" text-anchor="middle">${n}</text>`;
    })
    .join("");

  return `<svg class="clk-face" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" aria-hidden="true" data-clock-id="${id}">
    <defs>
      <clipPath id="${uid}-clip"><circle cx="${CX}" cy="${CY}" r="${DIAL_R - 1}"/></clipPath>
    </defs>
    <circle class="clk-ring-outer" cx="${CX}" cy="${CY}" r="${DIAL_R + 2}"/>
    <circle class="clk-ring-inner" cx="${CX}" cy="${CY}" r="${DIAL_R - 6}"/>
    ${marks}
    ${numerals}
    <g class="clk-hand-stack" clip-path="url(#${uid}-clip)">
      <g class="clk-hand-group" data-hand="hour">
        <path class="clk-hand-shape hour" fill="#c9a84c" d="${handPolygon(CX, CY, HAND.hour, 3.2)}"/>
      </g>
      <g class="clk-hand-group" data-hand="minute">
        <path class="clk-hand-shape minute" fill="#dcc06a" d="${handPolygon(CX, CY, HAND.minute, 2.1)}"/>
      </g>
      <g class="clk-hand-group" data-hand="second">
        <line class="clk-hand-line second" x1="${CX}" y1="${CY + 8}" x2="${CX}" y2="${CY - HAND.second}"
          stroke="#e8edf2" stroke-width="1.3" stroke-linecap="round"/>
        <circle class="clk-second-tail" cx="${CX}" cy="${CY + 9}" r="2" fill="#e8edf2"/>
      </g>
    </g>
    <circle class="clk-hub-ring" cx="${CX}" cy="${CY}" r="4.8"/>
    <circle class="clk-hub" cx="${CX}" cy="${CY}" r="2.6"/>
  </svg>`;
}

function renderGrid(root) {
  root.innerHTML = CLOCKS.map(
    (c) => `<div class="clk-card" data-tz="${c.tz}" data-session="${c.session ?? ""}">
      ${svgClock(c.id)}
      <div class="clk-label">${c.label}</div>
      <div class="clk-digital" data-digital="${c.id}">--:--</div>
      <div class="clk-date" data-date="${c.id}">—</div>
      <div class="clk-sub">${c.sub}</div>
      <span class="clk-session-dot" data-dot="${c.session ?? ""}" title="Market session"></span>
    </div>`,
  ).join("");
}

function renderSessionStrip(root) {
  root.innerHTML = SESSIONS.map(
    (s) =>
      `<span class="sess-chip${s.gold ? " sess-chip--gold" : ""}" data-sess="${s.id}">
        <span class="sess-dot"></span>${s.label}
      </span>`,
  ).join("");
}

function updateHands(svg, angles) {
  for (const hand of ["hour", "minute", "second"]) {
    const el = svg.querySelector(`[data-hand="${hand}"]`);
    if (el) el.setAttribute("transform", `rotate(${angles[hand]} ${CX} ${CY})`);
  }
}

let lastDigitalMinute = "";

function tick(grid, strip, now, msFrac) {
  let digitalKey = "";
  for (const card of grid.querySelectorAll(".clk-card")) {
    const tz = card.dataset.tz;
    const id = card.querySelector(".clk-face")?.dataset.clockId;
    const svg = card.querySelector(".clk-face");
    if (svg) updateHands(svg, clockAngles(now, tz, msFrac));
    digitalKey += `${id}:${digitalTime(now, tz)}:${digitalDate(now, tz)};`;
    const dig = card.querySelector(`[data-digital="${id}"]`);
    if (dig) dig.textContent = digitalTime(now, tz);
    const dateEl = card.querySelector(`[data-date="${id}"]`);
    if (dateEl) dateEl.textContent = digitalDate(now, tz);
    const sess = card.dataset.session;
    const dot = card.querySelector(".clk-session-dot");
    if (dot && sess) dot.classList.toggle("open", sessionOpen(sess, now));
  }
  if (digitalKey !== lastDigitalMinute) {
    lastDigitalMinute = digitalKey;
    for (const chip of strip.querySelectorAll(".sess-chip")) {
      chip.classList.toggle("open", sessionOpen(chip.dataset.sess, now));
    }
  }
}

function init() {
  const grid = document.getElementById("marketDeskClockGrid");
  const strip = document.getElementById("marketSessionStrip");
  if (!grid || !strip) return;

  renderGrid(grid);
  renderSessionStrip(strip);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    tick(grid, strip, new Date(), 0);
    setInterval(() => tick(grid, strip, new Date(), 0), 60_000);
    return;
  }

  let raf = 0;
  let running = true;
  const loop = () => {
    if (!running) return;
    const now = new Date();
    tick(grid, strip, now, now.getMilliseconds());
    raf = requestAnimationFrame(loop);
  };
  loop();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else {
      running = true;
      loop();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
