/**
 * Emit openapi.json and /.well-known/x402* as static files for Vercel.
 * Rewrites to Edge handlers 404 for dotted / .well-known paths; x402scan needs these URLs.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLoungeServiceCard } from "../backend/concierge-api/agent-identity-card.ts";
import {
  buildApiCatalogLinkset,
  buildAsyncApiDocument,
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

// x402-list.com owner-update domain proof (public by design; only its hash is stored server-side).
const x402ListProofTokens = [
  "x402list-verify-IM0GFNbBk89D5oMYiMP5Pa7tY94oZUDtf5or4WM0sQ0",
];
writeFileSync(join(wellKnownDir, "x402list.txt"), `${x402ListProofTokens.join("\n")}\n`, "utf8");

const agentCard = buildLoungeServiceCard(origin);
writeFileSync(
  join(wellKnownDir, "agent-card.json"),
  `${JSON.stringify(agentCard, null, 2)}\n`,
  "utf8",
);

const apiCatalog = buildApiCatalogLinkset(origin);
writeFileSync(
  join(wellKnownDir, "api-catalog"),
  `${JSON.stringify(apiCatalog, null, 2)}\n`,
  "utf8",
);

const asyncApi = buildAsyncApiDocument(origin);
writeFileSync(join(publicDir, "asyncapi.json"), `${JSON.stringify(asyncApi, null, 2)}\n`, "utf8");

writeFileSync(
  join(publicDir, "robots.txt"),
  [
    "User-agent: *",
    "Allow: /",
    "",
    "# Machine-readable AI usage preferences (Cloudflare Content Signals pattern)",
    "Content-signal: search=yes,ai-input=yes,ai-train=no",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n"),
  "utf8",
);

const skillSrc = join(__dirname, "..", "skills", "concierge-intel", "SKILL.md");
const skillOutDir = join(publicDir, "skills", "concierge-intel");
mkdirSync(skillOutDir, { recursive: true });
copyFileSync(skillSrc, join(skillOutDir, "SKILL.md"));

const securitySkillSrc = join(__dirname, "..", "skills", "concierge-security", "SKILL.md");
const securitySkillOutDir = join(publicDir, "skills", "concierge-security");
mkdirSync(securitySkillOutDir, { recursive: true });
copyFileSync(securitySkillSrc, join(securitySkillOutDir, "SKILL.md"));

const edgeSkillSrc = join(__dirname, "..", "skills", "concierge-edge", "SKILL.md");
const edgeSkillOutDir = join(publicDir, "skills", "concierge-edge");
mkdirSync(edgeSkillOutDir, { recursive: true });
copyFileSync(edgeSkillSrc, join(edgeSkillOutDir, "SKILL.md"));

const gemmaDistSrc = join(__dirname, "..", "distribution", "gemma");
const gemmaDistOut = join(publicDir, "distribution", "gemma");
mkdirSync(gemmaDistOut, { recursive: true });
for (const name of ["concierge-edge-preset.py", "litert-tools-manifest.json", "README.md"] as const) {
  copyFileSync(join(gemmaDistSrc, name), join(gemmaDistOut, name));
}

const pathCount = Object.keys(openapi.paths as object).length;
console.log(
  `discovery static → ${origin} (${pathCount} OpenAPI paths, ${(x402.resources as string[]).length} x402 resources, api-catalog + asyncapi + robots.txt + skill)`,
);
