/**
 * Emit openapi.json and /.well-known/x402* as static files for Vercel.
 * Rewrites to Edge handlers 404 for dotted / .well-known paths; x402scan needs these URLs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLoungeServiceCard } from "../backend/concierge-api/agent-identity-card.ts";
import {
  buildOpenApiDocument,
  buildWellKnownX402Document,
} from "../backend/concierge-api/x402-discovery.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "frontend", "public");
const wellKnownDir = join(publicDir, ".well-known");
const origin = (
  process.env.X402_SITE_ORIGIN ??
  process.env.ORIGIN ??
  "https://conc-exe.xyz"
).replace(/\/$/, "");

mkdirSync(wellKnownDir, { recursive: true });

const openapi = buildOpenApiDocument(origin);
writeFileSync(join(publicDir, "openapi.json"), `${JSON.stringify(openapi, null, 2)}\n`, "utf8");

const x402 = buildWellKnownX402Document(origin);
const x402Body = `${JSON.stringify(x402, null, 2)}\n`;
writeFileSync(join(wellKnownDir, "x402.json"), x402Body, "utf8");
writeFileSync(join(wellKnownDir, "x402"), x402Body, "utf8");

const agentCard = buildLoungeServiceCard(origin);
writeFileSync(
  join(wellKnownDir, "agent-card.json"),
  `${JSON.stringify(agentCard, null, 2)}\n`,
  "utf8",
);

const pathCount = Object.keys(openapi.paths as object).length;
console.log(
  `discovery static → ${origin} (${pathCount} OpenAPI paths, ${(x402.resources as string[]).length} x402 resources)`,
);
