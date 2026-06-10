/**
 * Generate pay-skills OpenAPI snapshot from local x402-discovery (authoritative).
 * Prefer this over fetching production when API changes are not yet deployed.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../lib/concierge-api/x402-discovery.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const origin = (process.env.ORIGIN ?? "https://conc-exe.xyz").replace(/\/$/, "");
const outPath = join(__dirname, "..", "pay-skills", "conc-exe", "concierge-agent", "openapi.json");

const doc = buildOpenApiDocument(origin);

const discovery = doc["x-discovery"] as Record<string, unknown> | undefined;
const proofs = discovery?.ownershipProofs;
if (!Array.isArray(proofs) || proofs.length === 0) {
  try {
    const res = await fetch(`${origin}/openapi.json`, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const live = (await res.json()) as Record<string, unknown>;
      const liveProofs = (live["x-discovery"] as Record<string, unknown> | undefined)?.ownershipProofs;
      if (Array.isArray(liveProofs) && liveProofs.length && discovery) {
        discovery.ownershipProofs = liveProofs;
      }
    }
  } catch {
    // Local build without network — snapshot may omit proofs until deploy
  }
}

writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath} (${Object.keys(doc.paths as object).length} paths)`);
