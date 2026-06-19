#!/usr/bin/env node
/**
 * Copy thebuyside seed entries into a local thebuyside-x402-agent clone for PR.
 *
 *   node scripts/prepare-thebuyside-pr.mjs
 *   node scripts/prepare-thebuyside-pr.mjs ../thebuyside-x402-agent
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const entriesPath = join(repoRoot, "distribution", "thebuyside", "seed-entries.json");
const cloneRoot = process.argv[2] ?? join(repoRoot, "..", "thebuyside-x402-agent");
const seedPath = join(cloneRoot, "src", "registry", "seed.json");

if (!existsSync(entriesPath)) {
  console.error("Missing distribution/thebuyside/seed-entries.json");
  process.exit(1);
}

if (!existsSync(cloneRoot)) {
  console.log("Cloning jaysperspective/thebuyside-x402-agent …");
  execSync(`git clone https://github.com/jaysperspective/thebuyside-x402-agent.git "${cloneRoot}"`, {
    stdio: "inherit",
  });
}

const bundle = JSON.parse(readFileSync(entriesPath, "utf8"));
const newEntries = bundle.entries ?? [];

if (!existsSync(seedPath)) {
  console.error(`seed.json not found at ${seedPath}`);
  process.exit(1);
}

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const existing = seed.entries ?? [];
const existingIds = new Set(existing.map((e) => e.id));
const toAdd = newEntries.filter((e) => !existingIds.has(e.id));

if (toAdd.length === 0) {
  console.log("All Concierge entries already present in seed.json");
  process.exit(0);
}

seed.entries = [...existing, ...toAdd];
writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");

console.log(`Added ${toAdd.length} entries to ${seedPath}:`);
for (const e of toAdd) console.log(`  • ${e.id} — ${e.name}`);

console.log("");
console.log("Next:");
console.log(`  cd "${cloneRoot}"`);
console.log("  pnpm install && pnpm verify-seed");
console.log("  git checkout -b add-conc-exe-intel-routes");
console.log("  git add src/registry/seed.json");
console.log('  git commit -s -m "Add Concierge Agent x402 intel routes (conc-exe.xyz)"');
console.log("  git push -u origin add-conc-exe-intel-routes");
console.log("  Open PR on https://github.com/jaysperspective/thebuyside-x402-agent/compare");
