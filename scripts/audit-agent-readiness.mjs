import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const publicDir = join(repoRoot, "frontend", "public");

/**
 * Agent-readiness audit — api-evangelist/agent-readiness nine-dimension model.
 *
 *   node scripts/audit-agent-readiness.mjs
 *   node scripts/audit-agent-readiness.mjs --local
 *   API_ORIGIN=https://conc-exe.xyz node scripts/audit-agent-readiness.mjs
 *   node scripts/audit-agent-readiness.mjs --json
 *
 * @see https://github.com/api-evangelist/agent-readiness
 */
const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const localMode = args.includes("--local");
const origin = (process.env.API_ORIGIN ?? process.env.X402_SITE_ORIGIN ?? "https://conc-exe.xyz").replace(
  /\/$/,
  "",
);

const SCORE_LABELS = {
  0: "absent",
  1: "partial",
  2: "present",
  3: "exemplary",
};

const DIMENSIONS = [
  { id: "spec-presence", name: "Spec presence" },
  { id: "auth-model-clarity", name: "Auth model clarity" },
  { id: "idempotency", name: "Idempotency" },
  { id: "error-semantics", name: "Error semantics" },
  { id: "rate-limit-headers", name: "Rate-limit headers" },
  { id: "dry-run-simulate", name: "Dry-run / simulate mode" },
  { id: "openapi-examples", name: "OpenAPI examples" },
  { id: "mcp-server", name: "MCP server" },
  { id: "asyncapi-events", name: "AsyncAPI / events" },
];

const FORWARD_DIMENSIONS = [
  { id: "well-known-api-catalog", name: "RFC 9727 /.well-known/api-catalog" },
  { id: "consent-signals", name: "Consent signals (AIPREF / Content-Signals)" },
  { id: "web-bot-auth", name: "Web Bot Auth (RFC 9421)" },
];

/** @type {Record<string, string[]>} */
const RATE_LIMIT_HEADER_NAMES = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after",
  "ratelimit-limit",
  "ratelimit-remaining",
];

async function fetchText(url, init) {
  const res = await fetch(url, { redirect: "follow", ...init });
  const text = await res.text();
  return { res, text };
}

async function probe402Headers() {
  const url = `${origin}/api/concierge-intel-tvl`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const headers = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { status: res.status, headers };
}

function collectOperations(openapi) {
  const ops = [];
  for (const [path, item] of Object.entries(openapi.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const op = item?.[method];
      if (op) ops.push({ path, method: method.toUpperCase(), op });
    }
  }
  return ops;
}

function hasResponseCode(op, code) {
  return Boolean(op.responses?.[String(code)] ?? op.responses?.[code]);
}

function hasExampleInContent(content) {
  if (!content || typeof content !== "object") return false;
  for (const media of Object.values(content)) {
    if (media?.example != null) return true;
    if (media?.examples && Object.keys(media.examples).length > 0) return true;
  }
  return false;
}

function scoreSpecPresence(openapi, probes) {
  if (!openapi?.openapi?.startsWith("3.")) {
    return { score: 0, evidence: `${origin}/openapi.json`, notes: ["No OpenAPI 3.x document"] };
  }
  const pathCount = Object.keys(openapi.paths ?? {}).length;
  const opCount = collectOperations(openapi).length;
  if (probes.openApiStatus !== 200) {
    return { score: 1, evidence: `${origin}/openapi.json`, notes: ["Spec exists but not publicly reachable"] };
  }
  if (pathCount >= 10 && openapi.info?.["x-guidance"]) {
    return {
      score: 3,
      evidence: `${origin}/openapi.json`,
      notes: [
        `OpenAPI ${openapi.openapi} with ${pathCount} paths / ${opCount} operations`,
        "info.x-guidance present for agent-friendly discovery",
        "Static + live spec at predictable URL",
      ],
    };
  }
  return {
    score: 2,
    evidence: `${origin}/openapi.json`,
    notes: [`OpenAPI ${openapi.openapi}, ${pathCount} paths`],
  };
}

function scoreAuthModel(openapi, probes) {
  const notes = [];
  let score = 0;
  const guidance = openapi?.info?.["x-guidance"];
  if (typeof guidance === "string" && /402|PAYMENT-SIGNATURE|x402|USDC/i.test(guidance)) {
    score += 1;
    notes.push("info.x-guidance documents x402 payment flow");
  }
  const ops = collectOperations(openapi);
  const withPayment = ops.filter((o) => o.op["x-payment-info"]);
  if (withPayment.length > 0) {
    score = Math.max(score, 2);
    notes.push(`${withPayment.length}/${ops.length} operations declare x-payment-info`);
  }
  if (probes.wellKnownX402) {
    score = Math.max(score, 2);
    notes.push("/.well-known/x402 discovery document reachable");
  }
  if (probes.paymentRequiredHeader) {
    score = Math.max(score, 2);
    notes.push("Live 402 exposes PAYMENT-REQUIRED header with accepts[]");
  }
  const schemes = openapi?.components?.securitySchemes;
  if (schemes && Object.keys(schemes).length > 0) {
    score = 3;
    notes.push("components.securitySchemes defined in OpenAPI");
  } else {
    notes.push("No OpenAPI securitySchemes — auth is x402 header-based (documented via x-payment-info)");
    if (score >= 2) score = 2;
  }
  return { score, evidence: `${origin}/openapi.json`, notes };
}

function scoreIdempotency(openapi) {
  const notes = [];
  const ops = collectOperations(openapi);
  const idempotencyHeader = ops.some((o) =>
    (o.op.parameters ?? []).some((p) => /idempotency/i.test(p.name ?? "")),
  );
  const idempotencyDoc = JSON.stringify(openapi).toLowerCase().includes("idempotenc");
  if (idempotencyHeader || idempotencyDoc) {
    const idempotencyCount = ops.filter((o) =>
      (o.op.parameters ?? []).some((p) => /idempotency/i.test(p.name ?? "")),
    ).length;
    const notes = ["Idempotency documented or header present"];
    if (idempotencyCount >= ops.filter((o) => o.method === "POST").length * 0.8) {
      notes.push(`Idempotency-Key on ${idempotencyCount} operations`);
      return { score: 3, evidence: `${origin}/openapi.json`, notes };
    }
    return { score: 2, evidence: `${origin}/openapi.json`, notes };
  }
  return {
    score: 0,
    evidence: `${origin}/openapi.json`,
    notes: [
      "No Idempotency-Key header on mutating operations",
      "x402 per-call settlement — agent retries may double-pay unless client deduplicates",
    ],
  };
}

function scoreErrorSemantics(openapi) {
  const ops = collectOperations(openapi);
  const codes = [400, 401, 403, 404, 429, 500];
  const coverage = {};
  for (const code of codes) {
    coverage[code] = ops.filter((o) => hasResponseCode(o.op, code)).length;
  }
  const has402 = ops.every((o) => hasResponseCode(o.op, 402));
  const hasStable402 = ops.every((o) => {
    const r = o.op.responses?.["402"];
    return Boolean(r?.content?.["application/json"]?.schema);
  });
  const notes = [
    `402 documented on ${ops.filter((o) => hasResponseCode(o.op, 402)).length}/${ops.length} ops`,
    `400: ${coverage[400]}, 429: ${coverage[429]}, 500: ${coverage[500]} ops`,
  ];
  let score = 0;
  if (has402) score = 1;
  if (has402 && hasStable402) score = Math.max(score, 1);
  if (coverage[400] > 0 || coverage[429] > 0) score = Math.max(score, 1);
  if (openapi?.components?.schemas?.Error || openapi?.components?.schemas?.ApiError) score = Math.max(score, 2);
  if (
    (openapi?.components?.schemas?.ApiError || openapi?.components?.schemas?.Error) &&
    coverage[400] >= ops.length * 0.8 &&
    coverage[429] >= ops.length * 0.8 &&
    coverage[500] >= ops.length * 0.8
  ) {
    score = 3;
  }
  return { score, evidence: `${origin}/openapi.json`, notes };
}

function scoreRateLimitHeaders(probes) {
  const found = probes.rateLimitHeadersFound ?? [];
  if (found.length >= 2) {
    return { score: 3, evidence: `${origin}/api/concierge-intel-tvl`, notes: [`Headers: ${found.join(", ")}`] };
  }
  if (found.length === 1) {
    return { score: 1, evidence: `${origin}/api/concierge-intel-tvl`, notes: [`Partial: ${found[0]}`] };
  }
  return {
    score: 0,
    evidence: `${origin}/api/concierge-intel-tvl`,
    notes: ["No X-RateLimit-* or Retry-After on 402/200 probes"],
  };
}

function scoreDryRun(probes) {
  const notes = [];
  let score = 0;
  if (probes.intelGet402) {
    score = 1;
    notes.push("GET intel probes return 402 without executing paid logic");
  }
  if (probes.tokenPayPreview) {
    score = Math.max(score, 2);
    notes.push("POST /api/token-pay-preview validates merchant config without persisting");
  }
  if (probes.agentPlayground) {
    notes.push("Browser playground at /agent/playground for live 402 probing");
  }
  return { score, evidence: `${origin}/api/token-pay-preview`, notes };
}

function scoreOpenApiExamples(openapi) {
  const ops = collectOperations(openapi);
  let withResponseEx = 0;
  let withRequestEx = 0;
  let withOpId = 0;
  for (const { op } of ops) {
    if (op.operationId) withOpId++;
    const res200 = op.responses?.["200"];
    if (hasExampleInContent(res200?.content)) withResponseEx++;
    if (hasExampleInContent(op.requestBody?.content)) withRequestEx++;
  }
  const notes = [
    `operationId: ${withOpId}/${ops.length}`,
    `200 response examples: ${withResponseEx}/${ops.length}`,
    `requestBody examples: ${withRequestEx}/${ops.length}`,
  ];
  let score = 0;
  if (withOpId === ops.length) score = 1;
  if (withResponseEx >= ops.length * 0.8) score = Math.max(score, 2);
  if (withResponseEx === ops.length && withRequestEx >= ops.length * 0.8) score = 3;
  else if (withResponseEx === ops.length && withRequestEx >= ops.length * 0.5) score = Math.max(score, 2);
  else if (withResponseEx === ops.length) score = Math.max(score, 2);
  return { score, evidence: `${origin}/openapi.json`, notes };
}

function scoreMcp(probes) {
  if (probes.mcpTools >= 10) {
    return {
      score: 3,
      evidence: `${origin}/api/mcp`,
      notes: [
        `First-party MCP HTTP transport (${probes.mcpTools} tools)`,
        "JSON-RPC initialize | tools/list | tools/call",
      ],
    };
  }
  if (probes.mcpReachable) {
    return { score: 2, evidence: `${origin}/api/mcp`, notes: ["MCP endpoint reachable"] };
  }
  return { score: 0, evidence: `${origin}/api/mcp`, notes: ["MCP not reachable"] };
}

function scoreAsyncApi(probes) {
  if (probes.asyncApiUrl) {
    return { score: 2, evidence: probes.asyncApiUrl, notes: ["AsyncAPI contract published"] };
  }
  return {
    score: 0,
    evidence: `${origin}/openapi.json`,
    notes: ["No AsyncAPI / webhook contract — HTTP request/response only"],
  };
}

function scoreApiCatalog(probes) {
  if (probes.apiCatalogLinkset) {
    return { score: 3, evidence: `${origin}/.well-known/api-catalog`, notes: ["RFC 9727 linkset+json catalog"] };
  }
  const alt = [];
  if (probes.llmsTxt) alt.push("/llms.txt");
  if (probes.wellKnownX402) alt.push("/.well-known/x402");
  if (probes.agentCard) alt.push("/.well-known/agent-card.json");
  return {
    score: alt.length >= 2 ? 1 : 0,
    evidence: `${origin}/.well-known/api-catalog`,
    notes: [
      "RFC 9727 api-catalog not served (404 or non-linkset)",
      alt.length ? `Alternate discovery: ${alt.join(", ")}` : "No alternate discovery files",
    ],
  };
}

function scoreConsent(probes) {
  if (probes.contentSignals || probes.aipref) {
    return { score: 2, evidence: `${origin}/robots.txt`, notes: ["Machine-readable AI usage preferences"] };
  }
  return { score: 0, evidence: `${origin}/robots.txt`, notes: ["No Content-Signal or AIPREF headers"] };
}

function scoreWebBotAuth(probes) {
  if (probes.signatureAgent) {
    return { score: 2, evidence: origin, notes: ["HTTP Message Signatures / Web Bot Auth observed"] };
  }
  return { score: 0, evidence: origin, notes: ["No Web Bot Auth (RFC 9421) on API responses"] };
}

function meanScore(signals) {
  if (!signals.length) return 0;
  return signals.reduce((a, s) => a + s.score, 0) / signals.length;
}

async function runAudit() {
  const probes = {
    openApiStatus: 0,
    wellKnownX402: false,
    agentCard: false,
    llmsTxt: false,
    apiCatalogLinkset: false,
    mcpReachable: false,
    mcpTools: 0,
    paymentRequiredHeader: false,
    intelGet402: false,
    tokenPayPreview: false,
    agentPlayground: false,
    asyncApiUrl: null,
    contentSignals: false,
    aipref: false,
    signatureAgent: false,
    rateLimitHeadersFound: [],
  };

  let openapi = null;

  if (localMode) {
    const openApiPath = join(publicDir, "openapi.json");
    if (existsSync(openApiPath)) {
      openapi = JSON.parse(readFileSync(openApiPath, "utf8"));
      probes.openApiStatus = 200;
    }
    probes.wellKnownX402 = existsSync(join(publicDir, ".well-known", "x402.json"));
    probes.agentCard = existsSync(join(publicDir, ".well-known", "agent-card.json"));
    probes.llmsTxt = existsSync(join(publicDir, "llms.txt"));
    const catalogPath = join(publicDir, ".well-known", "api-catalog");
    if (existsSync(catalogPath)) {
      const body = JSON.parse(readFileSync(catalogPath, "utf8"));
      probes.apiCatalogLinkset = Array.isArray(body.linkset);
    }
    probes.asyncApiUrl = existsSync(join(publicDir, "asyncapi.json"))
      ? `${origin}/asyncapi.json`
      : null;
    const robotsPath = join(publicDir, "robots.txt");
    if (existsSync(robotsPath)) {
      const txt = readFileSync(robotsPath, "utf8");
      probes.contentSignals = /content-signal/i.test(txt);
    }
    console.error("[audit] --local mode: OpenAPI/static from frontend/public; live API probes skipped except when deployed.");
  }

  if (!localMode) {
    try {
      const { res, text } = await fetchText(`${origin}/openapi.json`);
      probes.openApiStatus = res.status;
      if (res.ok) openapi = JSON.parse(text);
    } catch (e) {
      console.error(`Failed to fetch OpenAPI: ${e instanceof Error ? e.message : e}`);
    }

    const probeUrls = [
      ["wellKnownX402", "/.well-known/x402"],
      ["agentCard", "/.well-known/agent-card.json"],
      ["llmsTxt", "/llms.txt"],
    ];
    for (const [key, path] of probeUrls) {
      try {
        const res = await fetch(`${origin}${path}`);
        probes[key] = res.ok;
      } catch {
        probes[key] = false;
      }
    }

    try {
      const res = await fetch(`${origin}/.well-known/api-catalog`, {
        headers: { Accept: "application/linkset+json" },
      });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && ct.includes("linkset")) {
        const body = await res.json();
        probes.apiCatalogLinkset = Array.isArray(body.linkset);
      }
    } catch {
      /* ignore */
    }

    try {
      const res = await fetch(`${origin}/api/mcp`);
      probes.mcpReachable = res.ok;
      if (res.ok) {
        const body = await res.json();
        probes.mcpTools = Number(body.tools) || 0;
      }
    } catch {
      /* ignore */
    }

    try {
      const getRes = await fetch(`${origin}/api/concierge-intel-macro`, { method: "GET" });
      probes.intelGet402 = getRes.status === 402;
    } catch {
      /* ignore */
    }

    try {
      const prev = await fetch(`${origin}/api/token-pay-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: { id: "audit-probe" } }),
      });
      probes.tokenPayPreview = prev.ok || prev.status === 200;
    } catch {
      /* ignore */
    }

    try {
      const pg = await fetch(`${origin}/agent/playground`);
      probes.agentPlayground = pg.ok;
    } catch {
      /* ignore */
    }

    try {
      const robots = await fetch(`${origin}/robots.txt`);
      if (robots.ok) {
        const txt = await robots.text();
        probes.contentSignals = /content-signal/i.test(txt);
        probes.aipref = /aipref/i.test(txt);
      }
    } catch {
      /* ignore */
    }

    try {
      const asyncRes = await fetch(`${origin}/asyncapi.json`);
      if (asyncRes.ok) {
        const body = await asyncRes.json();
        if (body.asyncapi) probes.asyncApiUrl = `${origin}/asyncapi.json`;
      }
    } catch {
      /* ignore */
    }

    try {
      const p402 = await probe402Headers();
      probes.paymentRequiredHeader = Boolean(p402.headers["payment-required"]);
      probes.signatureAgent = Boolean(p402.headers["signature-agent"]);
      for (const name of RATE_LIMIT_HEADER_NAMES) {
        if (p402.headers[name]) probes.rateLimitHeadersFound.push(name);
      }
    } catch {
      /* ignore */
    }
  }

  const coreSignals = [
    { ...DIMENSIONS[0], ...scoreSpecPresence(openapi, probes) },
    { ...DIMENSIONS[1], ...scoreAuthModel(openapi, probes) },
    { ...DIMENSIONS[2], ...scoreIdempotency(openapi) },
    { ...DIMENSIONS[3], ...scoreErrorSemantics(openapi) },
    { ...DIMENSIONS[4], ...scoreRateLimitHeaders(probes) },
    { ...DIMENSIONS[5], ...scoreDryRun(probes) },
    { ...DIMENSIONS[6], ...scoreOpenApiExamples(openapi) },
    { ...DIMENSIONS[7], ...scoreMcp(probes) },
    { ...DIMENSIONS[8], ...scoreAsyncApi(probes) },
  ];

  const forwardSignals = [
    { ...FORWARD_DIMENSIONS[0], ...scoreApiCatalog(probes) },
    { ...FORWARD_DIMENSIONS[1], ...scoreConsent(probes) },
    { ...FORWARD_DIMENSIONS[2], ...scoreWebBotAuth(probes) },
  ];

  const coreMean = meanScore(coreSignals);
  const forwardMean = meanScore(forwardSignals);
  const overallMean = meanScore([...coreSignals, ...forwardSignals]);

  const report = {
    provider: "Concierge Agent",
    origin,
    auditedAt: new Date().toISOString(),
    framework: "api-evangelist/agent-readiness",
    frameworkUrl: "https://github.com/api-evangelist/agent-readiness",
    scores: {
      core: { mean: round2(coreMean), max: 3, dimensions: 9 },
      forwardLooking: { mean: round2(forwardMean), max: 3, dimensions: 3 },
      overall: { mean: round2(overallMean), max: 3, dimensions: 12 },
    },
    signals: [...coreSignals, ...forwardSignals],
    probes,
    recommendations: buildRecommendations(coreSignals, forwardSignals),
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.scores.core.mean >= 1.5 ? 0 : 1);
  }

  printReport(report);
  process.exit(0);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buildRecommendations(core, forward) {
  /** @type {string[]} */
  const recs = [];
  for (const s of [...core, ...forward]) {
    if (s.score >= 2) continue;
    if (s.id === "well-known-api-catalog") {
      recs.push("Add RFC 9727 /.well-known/api-catalog (static linkset) — 0 Vercel functions");
    } else if (s.id === "rate-limit-headers") {
      recs.push("Document rate limits in OpenAPI; optionally expose Retry-After on 429");
    } else if (s.id === "idempotency") {
      recs.push("Document x402 payment dedup semantics; consider Idempotency-Key for signal-publish");
    } else if (s.id === "error-semantics") {
      recs.push("Add components.schemas.Error + 400/429/500 responses to OpenAPI operations");
    } else if (s.id === "openapi-examples") {
      recs.push("Add requestBody.example on each POST operation in OpenAPI generator");
    } else if (s.id === "asyncapi-events") {
      recs.push("Optional: AsyncAPI for webhook/event surfaces if added later");
    }
  }
  return [...new Set(recs)];
}

function printReport(report) {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Agent-Readiness Audit — Concierge Agent");
  console.log(`  Origin: ${report.origin}`);
  console.log(`  Framework: ${report.framework}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("  CORE (9 dimensions)");
  console.log("  ─────────────────────────────────────────────────────────");
  for (const s of report.signals.slice(0, 9)) {
    printSignal(s);
  }
  console.log("");
  console.log(`  Core mean: ${report.scores.core.mean} / 3`);
  console.log("");
  console.log("  FORWARD-LOOKING (3 dimensions)");
  console.log("  ─────────────────────────────────────────────────────────");
  for (const s of report.signals.slice(9)) {
    printSignal(s);
  }
  console.log("");
  console.log(`  Forward mean: ${report.scores.forwardLooking.mean} / 3`);
  console.log(`  Overall mean: ${report.scores.overall.mean} / 3`);
  console.log("");

  if (report.recommendations.length) {
    console.log("  TOP RECOMMENDATIONS (score < 2)");
    console.log("  ─────────────────────────────────────────────────────────");
    for (const r of report.recommendations) {
      console.log(`  • ${r}`);
    }
    console.log("");
  }

  console.log("  Run with --json for machine-readable output.");
  console.log("");
}

function printSignal(s) {
  const bar = "█".repeat(s.score) + "░".repeat(3 - s.score);
  console.log(`  [${bar}] ${s.score}/3 ${SCORE_LABELS[s.score]?.padEnd(10)} ${s.name}`);
  for (const n of s.notes ?? []) {
    console.log(`           ↳ ${n}`);
  }
}

runAudit().catch((e) => {
  console.error(e);
  process.exit(1);
});
