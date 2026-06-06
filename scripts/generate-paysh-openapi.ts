/**
 * Generate pay-skills OpenAPI snapshot from local x402-discovery (authoritative).
 * Prefer this over fetching production when API changes are not yet deployed.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../api/lib/x402-discovery.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const origin = (process.env.ORIGIN ?? "https://conc-exe.xyz").replace(/\/$/, "");
const outPath = join(__dirname, "..", "pay-skills", "conc-exe", "concierge-agent", "openapi.json");

const doc = buildOpenApiDocument(origin);
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath} (${Object.keys(doc.paths as object).length} paths)`);
