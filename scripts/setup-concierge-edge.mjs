#!/usr/bin/env node
/**
 * Setup Concierge Edge developer toolchain (Windows-first, cross-platform checks).
 * Usage: node scripts/setup-concierge-edge.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const isWin = process.platform === "win32";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...opts });
  return { ok: r.status === 0, out: (r.stdout || r.stderr || "").trim(), status: r.status };
}

function step(label, ok, detail = "") {
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

console.log("\nConcierge Edge setup\n");

let ok = true;

// Python
let py = null;
for (const bin of ["python", "python3"]) {
  const v = run(bin, ["--version"]);
  if (v.ok) {
    py = bin;
    break;
  }
}
if (!py && isWin) {
  console.log("→ Installing Python 3.12 via winget…");
  const winget = run("winget", [
    "install",
    "--id",
    "Python.Python.3.12",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--disable-interactivity",
  ]);
  if (winget.ok) {
    for (const bin of ["python", "python3"]) {
      const v = run(bin, ["--version"]);
      if (v.ok) {
        py = bin;
        break;
      }
    }
  }
}
ok = step("Python 3.12+", !!py, py ? run(py, ["--version"]).out : "not found") && ok;

// uv + litert-lm
if (py) {
  const uvCheck = run(py, ["-m", "uv", "--version"]);
  if (!uvCheck.ok) {
    console.log("→ Installing uv…");
    run(py, ["-m", "pip", "install", "uv"], { timeout: 120_000 });
  }
  ok = step("uv", run(py, ["-m", "uv", "--version"]).ok, run(py, ["-m", "uv", "--version"]).out) && ok;

  const litertCheck = run("litert-lm", ["--version"]);
  if (!litertCheck.ok) {
    console.log("→ Installing litert-lm (may take a minute)…");
    run(py, ["-m", "uv", "tool", "install", "litert-lm"], { timeout: 300_000 });
  }
  const litert = run("litert-lm", ["--version"]);
  ok = step("litert-lm CLI", litert.ok, litert.out || "add %USERPROFILE%\\.local\\bin to PATH") && ok;
}

// pay CLI
const payWhere = isWin ? run("where.exe", ["pay"]) : run("which", ["pay"]);
const payOk = payWhere.ok && payWhere.out.length > 0;
ok = step("pay CLI", payOk, payOk ? payWhere.out.split("\n")[0] : "npm i -g @solana/pay") && ok;

if (payOk) {
  const setupArgs = ["setup"];
  if (isWin) setupArgs.push("--backend=windows-hello");
  const paySetup = run("pay", setupArgs, { timeout: 120_000 });
  if (paySetup.ok) {
    step("pay wallet", true, "configured");
  } else if (paySetup.out.includes("already") || paySetup.out.includes("configured")) {
    step("pay wallet", true, "existing account");
  } else {
    step(
      "pay wallet",
      false,
      "run manually: pay setup --backend=windows-hello (interactive)",
    );
  }
}

// Local assets
const assets = [
  "distribution/gemma/concierge-edge-preset.py",
  "distribution/gemma/litert-tools-manifest.json",
  "frontend/public/docs-integration-gemma.html",
];
for (const rel of assets) {
  ok = step(`asset ${rel}`, existsSync(join(root, rel))) && ok;
}

console.log("\nNext steps:");
console.log("  1. npm run dev");
console.log("  2. npm run edge:verify:local");
console.log("  3. litert-lm run --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm gemma-4-E2B-it.litertlm --preset=distribution/gemma/concierge-edge-preset.py");
console.log("  4. Open http://localhost:8080/docs/integration/gemma\n");

if (!ok) process.exit(1);
