/** Macro desk intelligence — central bank wire, economic calendar, Treasury yields. */

import {
  CENTRAL_BANK_RSS_FEEDS,
  fetchHeadlinesFromFeeds,
  type NewsHeadline,
} from "./market-sources";

const FETCH_MS = 2_800;

const MACRO_HEADLINE_RE =
  /\b(nfp|non-?farm|payrolls?|cpi|ppi|pce|fomc|fed\b|federal reserve|ecb|boj|boe|central bank|interest rate|rate decision|inflation|unemployment|gdp|pmi|ism|jobs report|treasury|dot plot|powell|lagarde|taper|qe|qt|balance sheet|monetary policy|rate cut|rate hike)\b/i;

/** FOMC statement days (UTC, ~2pm ET). */
const FOMC_DECISION_DAYS = [
  "2025-05-07",
  "2025-06-18",
  "2025-07-30",
  "2025-09-17",
  "2025-11-07",
  "2025-12-17",
  "2026-01-28",
  "2026-03-18",
  "2026-05-06",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-11-05",
  "2026-12-16",
];

const ECB_DECISION_DAYS = [
  "2025-06-05",
  "2025-07-24",
  "2025-09-11",
  "2025-10-30",
  "2025-12-18",
  "2026-02-05",
  "2026-03-19",
  "2026-04-30",
  "2026-06-11",
  "2026-07-23",
  "2026-09-10",
  "2026-10-29",
  "2026-12-17",
];

const BOE_DECISION_DAYS = [
  "2025-05-08",
  "2025-06-19",
  "2025-08-07",
  "2025-09-18",
  "2025-11-06",
  "2025-12-18",
  "2026-02-05",
  "2026-03-19",
  "2026-05-07",
  "2026-06-18",
  "2026-08-06",
  "2026-09-17",
  "2026-11-05",
  "2026-12-17",
];

const BOJ_DECISION_DAYS = [
  "2025-04-30",
  "2025-06-17",
  "2025-07-31",
  "2025-09-19",
  "2025-10-30",
  "2025-12-19",
  "2026-01-23",
  "2026-03-19",
  "2026-04-28",
  "2026-06-16",
  "2026-07-31",
  "2026-09-18",
  "2026-10-30",
  "2026-12-18",
];

export type MacroYieldSnap = {
  label: string;
  value: string;
  change: string;
};

export type MacroCalendarEvent = {
  name: string;
  region: string;
  importance: "high" | "medium";
  scheduledAt: string;
  note?: string;
};

export type MacroContext = {
  yields: MacroYieldSnap[];
  upcomingEvents: MacroCalendarEvent[];
  centralBankHeadlines: NewsHeadline[];
  macroHeadlines: NewsHeadline[];
};

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function firstFridayUtc(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(13, 30, 0, 0);
  return d;
}

function nextNfp(from: Date): Date {
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  let nfp = firstFridayUtc(y, m);
  if (nfp.getTime() <= from.getTime()) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    nfp = firstFridayUtc(y, m);
  }
  return nfp;
}

function nextUsCpi(from: Date): Date {
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  let cpi = new Date(Date.UTC(y, m, 12, 13, 30, 0));
  if (cpi.getTime() <= from.getTime()) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    cpi = new Date(Date.UTC(y, m, 12, 13, 30, 0));
  }
  return cpi;
}

function eventsFromDates(
  days: string[],
  name: string,
  region: string,
  note: string,
  from: Date,
  horizonMs: number,
): MacroCalendarEvent[] {
  const out: MacroCalendarEvent[] = [];
  for (const day of days) {
    const dt = new Date(`${day}T18:00:00.000Z`);
    if (dt.getTime() > from.getTime() && dt.getTime() <= horizonMs) {
      out.push({ name, region, importance: "high", scheduledAt: dt.toISOString(), note });
    }
  }
  return out;
}

export function buildMacroEventCalendar(from = new Date(), horizonDays = 21): MacroCalendarEvent[] {
  const horizonMs = from.getTime() + horizonDays * 86_400_000;
  const events: MacroCalendarEvent[] = [];

  const nfp = nextNfp(from);
  if (nfp.getTime() <= horizonMs) {
    events.push({
      name: "US Non-Farm Payrolls (NFP)",
      region: "US",
      importance: "high",
      scheduledAt: nfp.toISOString(),
      note: "BLS jobs report · high impact on DXY, rates, BTC/ETH risk appetite",
    });
  }

  const cpi = nextUsCpi(from);
  if (cpi.getTime() <= horizonMs) {
    events.push({
      name: "US CPI (Inflation)",
      region: "US",
      importance: "high",
      scheduledAt: cpi.toISOString(),
      note: "BLS consumer price index · key Fed policy input",
    });
  }

  events.push(
    ...eventsFromDates(
      FOMC_DECISION_DAYS,
      "FOMC rate decision & statement",
      "US",
      "Federal Reserve · watch dot plot & Powell presser on projection meetings",
      from,
      horizonMs,
    ),
    ...eventsFromDates(
      ECB_DECISION_DAYS,
      "ECB Governing Council decision",
      "EU",
      "European Central Bank · EUR rates & Lagarde press conference",
      from,
      horizonMs,
    ),
    ...eventsFromDates(
      BOE_DECISION_DAYS,
      "BoE MPC rate decision",
      "UK",
      "Bank of England · GBP, gilt yields, global risk tone",
      from,
      horizonMs,
    ),
    ...eventsFromDates(
      BOJ_DECISION_DAYS,
      "BoJ policy decision",
      "JP",
      "Bank of Japan · JPY, carry trades, Asia session liquidity",
      from,
      horizonMs,
    ),
  );

  return events
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, 10);
}

export function filterMacroHeadlines(headlines: NewsHeadline[]): NewsHeadline[] {
  const seen = new Set<string>();
  const out: NewsHeadline[] = [];
  for (const h of headlines) {
    const key = h.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    if (!MACRO_HEADLINE_RE.test(`${h.title} ${h.summary ?? ""}`)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export function messageWantsMacroDesk(message: string): boolean {
  return MACRO_HEADLINE_RE.test(message) ||
    /\b(macro|regime|dxy|yields?|liquidity|risk-?on|risk-?off)\b/i.test(message);
}

async function yahooYield(
  yahooSymbol: string,
  label: string,
  timeoutMs: number,
): Promise<MacroYieldSnap | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`,
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json", "User-Agent": "ExecutiveLounge/1.0" },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }[] };
    };
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prev = meta?.chartPreviousClose;
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;
    const chg = ((price! - prev!) / prev!) * 100;
    return {
      label,
      value: `${price!.toFixed(2)}%`,
      change: fmtPct(chg),
    };
  } catch {
    return null;
  }
}

async function fetchMacroYields(timeoutMs: number): Promise<MacroYieldSnap[]> {
  const rows = await Promise.all([
    yahooYield("^IRX", "US 3M Treasury", timeoutMs),
    yahooYield("^FVX", "US 5Y Treasury", timeoutMs),
    yahooYield("^TNX", "US 10Y Treasury", timeoutMs),
    yahooYield("^TYX", "US 30Y Treasury", timeoutMs),
  ]);
  return rows.filter((r): r is MacroYieldSnap => r !== null);
}

export async function fetchMacroIntelligence(options?: {
  generalHeadlines?: NewsHeadline[];
  timeoutMs?: number;
  includeCalendar?: boolean;
}): Promise<MacroContext> {
  const ms = options?.timeoutMs ?? FETCH_MS;
  const [cbHeadlines, yields] = await Promise.all([
    fetchHeadlinesFromFeeds(CENTRAL_BANK_RSS_FEEDS, 2, ms),
    fetchMacroYields(ms),
  ]);

  const macroHeadlines = filterMacroHeadlines([...cbHeadlines, ...(options?.generalHeadlines ?? [])]);

  return {
    yields,
    upcomingEvents:
      options?.includeCalendar === false ? [] : buildMacroEventCalendar(new Date(), 21),
    centralBankHeadlines: cbHeadlines.slice(0, 12),
    macroHeadlines: macroHeadlines.slice(0, 14),
  };
}

export function formatMacroIntelligenceForPrompt(macro: MacroContext): string {
  const lines: string[] = [
    "MACRO DESK INTELLIGENCE (central banks, calendar, rates):",
    "Rules: Use for Fed/ECB/BoE/BoJ context, NFP/CPI/FOMC timing, and rates → DXY → risk-asset transmission. Attribute CB headlines by source (Federal Reserve, ECB, etc.). Calendar dates are scheduled estimates — confirm exact release times before trading.",
  ];

  if (macro.yields.length) {
    lines.push("\n[US TREASURY YIELDS — Yahoo Finance]");
    for (const y of macro.yields) {
      lines.push(`- ${y.label}: ${y.value} (${y.change} session)`);
    }
    lines.push("- Framework: rising real yields → stronger USD, pressure on duration & crypto beta; falling yields → risk-on tailwind.");
  }

  if (macro.upcomingEvents.length) {
    lines.push("\n[MACRO CALENDAR — next ~3 weeks (high impact)]");
    for (const e of macro.upcomingEvents) {
      const when = e.scheduledAt.slice(0, 16).replace("T", " UTC ");
      lines.push(`- [${e.region}] ${e.name} · ${when} · ${e.importance}${e.note ? ` — ${e.note}` : ""}`);
    }
  }

  if (macro.centralBankHeadlines.length) {
    lines.push("\n[CENTRAL BANK & POLICY WIRE]");
    for (const h of macro.centralBankHeadlines) {
      const when = h.published ? ` (${h.published})` : "";
      lines.push(`- [${h.source}]${when}: ${h.title}`);
      if (h.summary) lines.push(`  ${h.summary.slice(0, 200)}`);
    }
  }

  if (macro.macroHeadlines.length) {
    lines.push("\n[MACRO DATA & RATES HEADLINES]");
    for (const h of macro.macroHeadlines) {
      const when = h.published ? ` (${h.published})` : "";
      lines.push(`- [${h.source}]${when}: ${h.title}`);
    }
  }

  return lines.join("\n");
}
