/**
 * Validate mcp-registry/server.json structure before publish.
 * Full schema check: mcp-publisher validate (see mcp-registry/PUBLISH.md).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, "..", "mcp-registry", "server.json");

const doc = JSON.parse(readFileSync(path, "utf8"));
const errors = [];

if (!doc.name?.includes("/")) errors.push("name must be namespace/server form");
if (!doc.version) errors.push("version required");
if (!doc.remotes?.length) errors.push("remotes[] required for HTTP MCP");
const remote = doc.remotes?.[0];
if (remote?.type !== "streamable-http") errors.push("remotes[0].type must be streamable-http");
if (!remote?.url?.startsWith("https://")) errors.push("remotes[0].url must be https");

const origin = process.env.API_ORIGIN ?? "https://conc-exe.xyz";
if (remote?.url && !remote.url.includes("conc-exe.xyz") && origin.includes("conc-exe.xyz")) {
  errors.push("remotes URL should point at production /api/mcp");
}

if (errors.length) {
  console.error("mcp-registry/server.json validation failed:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(`OK — ${doc.name} v${doc.version} → ${remote.url}`);
