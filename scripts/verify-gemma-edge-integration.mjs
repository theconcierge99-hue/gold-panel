#!/usr/bin/env node
/**
 * Verify Gemma 4 Edge integration — static assets, discovery metadata, preset tools, live API.
 * Usage: node scripts/verify-gemma-edge-integration.mjs [--origin=http://localhost:8080]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(25_000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html or plain */
  }
  return { res, text, json };
}

function pythonBin() {
  const candidates = ["python", "python3", "py"];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 });
    if (r.status === 0) return bin;
  }
  return null;
}

console.log(`\nGemma Edge integration verify — ${origin}\n`);

const manifestPath = checkFile("distribution/gemma/litert-tools-manifest.json");
const publicManifest = checkFile("frontend/public/distribution/gemma/litert-tools-manifest.json");
const presetPath = checkFile("distribution/gemma/concierge-edge-preset.py");
checkFile("frontend/public/docs-integration-gemma.html");
checkFile("skills/concierge-edge/SKILL.md");
checkFile("frontend/public/skills/concierge-edge/SKILL.md");
checkFile("backend/concierge-api/gemma-links.ts");

if (manifestPath && publicManifest) {
  try {
    const a = JSON.parse(readFileSync(manifestPath, "utf8"));
    const b = JSON.parse(readFileSync(publicManifest, "utf8"));
    const fns = (a.tools || []).map((t) => t.presetFunction).sort().join(",");
    const fnsB = (b.tools || []).map((t) => t.presetFunction).sort().join(",");
    if (fns === fnsB && fns.includes("intel_verdict")) {
      pass("manifest parity", `${a.tools?.length || 0} tools`);
    } else {
      fail("manifest parity", "distribution vs public mismatch");
    }
  } catch (e) {
    fail("manifest JSON parse", e instanceof Error ? e.message : String(e));
  }
}

if (presetPath) {
  const preset = readFileSync(presetPath, "utf8");
  const required = [
    "intel_macro",
    "intel_wire",
    "intel_tvl",
    "intel_verdict",
    "intel_meteora",
    "intel_desk_brief",
    "system_instruction",
  ];
  const missing = required.filter((s) => !preset.includes(s));
  if (!missing.length) pass("preset content", `${required.length} symbols`);
  else fail("preset content", `missing: ${missing.join(", ")}`);
}

const py = pythonBin();
if (py) {
  const compile = spawnSync(py, ["-m", "py_compile", presetPath || ""], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (compile.status === 0) pass("preset Python syntax", py);
  else fail("preset Python syntax", (compile.stderr || compile.stdout || "").trim().slice(0, 120));
} else {
  fail("python available", "install Python 3.12+ for preset execution");
}

try {
  const doc = await fetch(`${origin}/docs/integration/gemma`, { signal: AbortSignal.timeout(15_000) });
  if (doc.ok) pass("docs page", `${origin}/docs/integration/gemma → ${doc.status}`);
  else if (isLocal && existsSync(join(root, "frontend/public/docs-integration-gemma.html"))) {
    pass("docs page (local static)", "file present");
  } else fail("docs page", `HTTP ${doc.status}`);
} catch (e) {
  if (isLocal && existsSync(join(root, "frontend/public/docs-integration-gemma.html"))) {
    pass("docs page (local static)", "file present; start npm run dev");
  } else fail("docs page", e instanceof Error ? e.message : String(e));
}

for (const rel of [
  "/distribution/gemma/litert-tools-manifest.json",
  "/distribution/gemma/concierge-edge-preset.py",
  "/skills/concierge-edge/SKILL.md",
]) {
  try {
    const r = await fetch(`${origin}${rel}`, { signal: AbortSignal.timeout(15_000) });
    if (r.ok) pass(`asset ${rel}`, `${r.status} ${(await r.text()).length}b`);
    else fail(`asset ${rel}`, `HTTP ${r.status}`);
  } catch (e) {
    fail(`asset ${rel}`, e instanceof Error ? e.message : String(e));
  }
}

try {
  const { res, json } = await fetchJson(`${origin}/openapi.json`);
  const xdisc = json?.["x-discovery"] || json?.info?.["x-discovery"];
  const guide = xdisc?.gemmaIntegrationGuide;
  if (res.ok && guide) {
    pass("OpenAPI gemma discovery link", String(guide).slice(0, 60));
  } else if (res.ok && isLocal) {
    fail("OpenAPI gemma discovery link", "run npx tsx scripts/write-discovery-static.ts then retry");
  } else if (res.ok) {
    fail("OpenAPI gemma discovery link", "not deployed yet — redeploy required");
  } else {
    fail("OpenAPI", `HTTP ${res.status}`);
  }
} catch (e) {
  fail("OpenAPI", e instanceof Error ? e.message : String(e));
}

for (const [path, body] of [
  ["/api/concierge-intel-macro", "{}"],
  ["/api/concierge-intel-tvl", "{}"],
  [
    "/api/concierge-intel-verdict",
    JSON.stringify({ message: "Gemma edge verify", includeInsider: false }),
  ],
]) {
  try {
    const probe = await fetchJson(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (probe.res.status === 402) {
      pass(`${path} 402 probe`, "payment gate active");
    } else if (probe.res.status === 200 && probe.json?.ok) {
      pass(`${path} probe`, isLocal ? "dev OK" : "200 OK");
    } else {
      fail(`${path} probe`, `HTTP ${probe.res.status}`);
    }
  } catch (e) {
    fail(`${path} probe`, e instanceof Error ? e.message : String(e));
  }
}

if (py && presetPath && isLocal) {
  const code = `
import os, json, importlib.util
os.environ['CONCIERGE_ORIGIN'] = ${JSON.stringify(origin)}
os.environ['CONCIERGE_PAY_CMD'] = 'pay'
spec = importlib.util.spec_from_file_location('preset', r'''${presetPath.replace(/\\/g, "\\\\")}''')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
out = mod.intel_macro()
data = json.loads(out)
assert data.get('ok') and data.get('kind') == 'intel-macro', out[:200]
print('ok')
`;
  const run = spawnSync(py, ["-c", code], { encoding: "utf8", timeout: 60_000 });
  if (run.status === 0 && run.stdout.trim() === "ok") {
    pass("preset intel_macro live", "Python tool → Concierge API");
  } else {
    const err = (run.stderr || run.stdout || "").trim().slice(0, 200);
    fail("preset intel_macro live", err || `exit ${run.status}`);
  }
}

const litert = spawnSync("litert-lm", ["--version"], { encoding: "utf8", timeout: 10_000 });
if (litert.status === 0) pass("litert-lm CLI", (litert.stdout || litert.stderr || "").trim());
else pass("litert-lm CLI", "optional — uv tool install litert-lm");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFix failed checks before sharing with developers.");
  process.exit(1);
}
console.log("\nAll Gemma Edge integration checks passed.\n");
