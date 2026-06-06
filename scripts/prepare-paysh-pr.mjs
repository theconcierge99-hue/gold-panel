#!/usr/bin/env node
/**
 * Copy pay-skills bundle into a local pay-skills clone for PR submission.
 * Usage: node scripts/prepare-paysh-pr.mjs [path-to-pay-skills-clone]
 *
 * Default clone path: ../pay-skills (sibling of gold-panel)
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const bundleSrc = join(repoRoot, "pay-skills", "conc-exe", "concierge-agent");
const cloneRoot = process.argv[2] ?? join(repoRoot, "..", "pay-skills");
const targetDir = join(cloneRoot, "providers", "conc-exe", "concierge-agent");

if (!existsSync(bundleSrc)) {
  console.error("Missing bundle — run: npm run paysh:sync-openapi");
  process.exit(1);
}

if (!existsSync(cloneRoot)) {
  console.log("Cloning solana-foundation/pay-skills …");
  execSync(`git clone https://github.com/solana-foundation/pay-skills.git "${cloneRoot}"`, {
    stdio: "inherit",
  });
}

mkdirSync(dirname(targetDir), { recursive: true });
cpSync(bundleSrc, targetDir, { recursive: true, force: true });
console.log(`Copied bundle → ${targetDir}`);
console.log("");
console.log("Next:");
console.log(`  cd "${cloneRoot}"`);
console.log("  git checkout -b add-conc-exe-concierge-agent");
console.log("  git add providers/conc-exe/concierge-agent");
console.log('  git commit -m "Add Concierge Agent market intelligence API (conc-exe/concierge-agent)"');
console.log("  git push -u origin add-conc-exe-concierge-agent");
console.log("  Open PR on https://github.com/solana-foundation/pay-skills/compare");
