#!/usr/bin/env node
/**
 * Verify OOBE Protocol integration — static assets, discovery metadata, and live API probes.
 * Usage: node scripts/verify-oobe-integration.mjs [--origin=https://conc-exe.xyz]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const origin = (() => {
  const flag = process.argv.find((a) => a.startsWith("--origin="));
  if (flag) return flag.slice("--origin=".length).replace(/\/$/, "");
  return (process.env.API_ORIGIN || "https://conc-exe.xyz").replace(/\/$/, "");
})();

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

const results = [];

function pass(label, detail = "") {
  results.push({ ok: true, label, detail });
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  results.push({ ok: false, label, detail });
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function checkFile(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    fail(`local file: ${rel}`, "missing");
    return null;
  }
  pass(`local file: ${rel}`);
  return p;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html or plain */
  }
  return { res, text, json };
}

console.log(`\nOOBE integration verify — ${origin}\n`);

// --- Static / repo ---
const manifestPath = checkFile("distribution/oobe/sap-tools-manifest.json");
const publicManifest = checkFile("frontend/public/distribution/oobe/sap-tools-manifest.json");
checkFile("frontend/public/docs-integration-oobe.html");
checkFile("frontend/public/skills/concierge-oobe/SKILL.md");
checkFile("backend/concierge-api/oobe-sap-x402.ts");
checkFile("backend/concierge-api/oobe-links.ts");

if (manifestPath && publicManifest) {
  try {
    const a = JSON.parse(readFileSync(manifestPath, "utf8"));
    const b = JSON.parse(readFileSync(publicManifest, "utf8"));
    const toolIds = (a.tools || []).map((t) => t.id).sort().join(",");
    const toolIdsB = (b.tools || []).map((t) => t.id).sort().join(",");
    if (toolIds === toolIdsB && toolIds.includes("concierge:intel-verdict")) {
      pass("manifest parity", toolIds);
    } else {
      fail("manifest parity", "distribution vs public mismatch");
    }
  } catch (e) {
    fail("manifest JSON parse", e instanceof Error ? e.message : String(e));
  }
}

// --- Live ---
try {
  const doc = await fetch(`${origin}/docs/integration/oobe`, { signal: AbortSignal.timeout(15_000) });
  if (doc.ok) pass("docs page", `${origin}/docs/integration/oobe → ${doc.status}`);
  else if (isLocal && existsSync(join(root, "frontend/public/docs-integration-oobe.html"))) {
    pass("docs page (local static)", "vercel rewrite — use production for URL test");
  } else {
    fail("docs page", `HTTP ${doc.status} — deploy required`);
  }
} catch (e) {
  if (isLocal && existsSync(join(root, "frontend/public/docs-integration-oobe.html"))) {
    pass("docs page (local static)", "file present; rewrite on Vercel only");
  } else {
    fail("docs page", e instanceof Error ? e.message : String(e));
  }
}

try {
  const { res, json } = await fetchJson(`${origin}/distribution/oobe/sap-tools-manifest.json`);
  if (res.ok && json?.tools?.length >= 2) {
    pass("public manifest", `${json.tools.length} tools`);
  } else {
    fail("public manifest", res.ok ? "invalid JSON" : `HTTP ${res.status}`);
  }
} catch (e) {
  fail("public manifest", e instanceof Error ? e.message : String(e));
}

try {
  const { res, json } = await fetchJson(`${origin}/openapi.json`);
  const xdisc = json?.["x-discovery"] || json?.info?.["x-discovery"];
  const oobeGuide = xdisc?.oobeIntegrationGuide || xdisc?.oobe;
  if (res.ok && oobeGuide) {
    pass("OpenAPI oobe discovery link", String(oobeGuide).slice(0, 60));
  } else if (res.ok && isLocal) {
    fail("OpenAPI oobe discovery link", "run npx tsx scripts/write-discovery-static.ts then retry");
  } else if (res.ok) {
    fail("OpenAPI oobe discovery link", "not deployed yet — redeploy required");
  } else {
    fail("OpenAPI", `HTTP ${res.status}`);
  }
} catch (e) {
  fail("OpenAPI", e instanceof Error ? e.message : String(e));
}

try {
  const probe = await fetchJson(`${origin}/api/concierge-intel-verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (probe.res.status === 402 && probe.res.headers.get("payment-required")) {
    pass("intel-verdict 402 probe", "PAYMENT-REQUIRED present");
  } else if (probe.res.status === 402) {
    pass("intel-verdict 402 probe", "402 without PAYMENT-REQUIRED header");
  } else if (probe.res.status === 200 && isLocal) {
    pass("intel-verdict probe (dev)", "x402 bypass — merchant env not set locally");
  } else {
    fail("intel-verdict probe", `expected 402, got ${probe.res.status}`);
  }
} catch (e) {
  fail("intel-verdict probe", e instanceof Error ? e.message : String(e));
}

try {
  const probe = await fetchJson(`${origin}/api/concierge-intel-meteora`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"sortByApy":true,"limit":3}',
  });
  if (probe.res.status === 402) {
    pass("intel-meteora 402 probe", "payment gate active");
  } else if (probe.res.status === 200 && isLocal) {
    pass("intel-meteora probe (dev)", "x402 bypass locally");
  } else {
    fail("intel-meteora probe", `expected 402, got ${probe.res.status}`);
  }
} catch (e) {
  fail("intel-meteora probe", e instanceof Error ? e.message : String(e));
}

try {
  const { res, json } = await fetchJson(`${origin}/.well-known/agent-card.json`);
  const protos = json?.protocols || [];
  if (res.ok && protos.includes("SAP")) {
    pass("agent-card SAP protocol");
  } else if (res.ok) {
    fail("agent-card SAP protocol", "not deployed yet — redeploy required");
  } else {
    fail("agent-card", `HTTP ${res.status}`);
  }
} catch (e) {
  fail("agent-card", e instanceof Error ? e.message : String(e));
}

try {
  const skill = await fetch(`${origin}/skills/concierge-oobe/SKILL.md`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (skill.ok) pass("OOBE skill URL");
  else fail("OOBE skill URL", `HTTP ${skill.status}`);
} catch (e) {
  fail("OOBE skill URL", e instanceof Error ? e.message : String(e));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFailed checks need deploy or config fix before production is fully live.");
  process.exit(1);
}
console.log("\nAll OOBE integration checks passed.\n");
