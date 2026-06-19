#!/usr/bin/env node
/**
 * Write /.well-known/mcp-registry-auth for MCP Registry HTTP domain verification.
 *
 *   node scripts/generate-mcp-registry-auth.mjs --generate   # new keypair → .secrets/
 *   MCP_REGISTRY_PRIVATE_KEY_HEX=… node scripts/generate-mcp-registry-auth.mjs
 *
 * @see mcp-registry/PUBLISH.md
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const secretsDir = join(repoRoot, ".secrets");
const authPath = join(repoRoot, "frontend", "public", ".well-known", "mcp-registry-auth");

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function seedFromPrivateHex(hex) {
  const seed = Buffer.from(hex.replace(/\s/g, ""), "hex");
  if (seed.length !== 32) {
    throw new Error("MCP_REGISTRY_PRIVATE_KEY_HEX must be 64 hex chars (32-byte Ed25519 seed)");
  }
  return seed;
}

function privateKeyFromSeed(seed) {
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function publicKeyBase64FromSeed(seed) {
  const pub = createPublicKey(privateKeyFromSeed(seed));
  const spki = pub.export({ type: "spki", format: "der" });
  return spki.subarray(-32).toString("base64");
}

function authLineFromSeed(seed) {
  return `v=MCPv1; k=ed25519; p=${publicKeyBase64FromSeed(seed)}`;
}

function extractSeedHex(privateKey) {
  const der = privateKey.export({ type: "pkcs8", format: "der" });
  return der.subarray(-32).toString("hex");
}

function generateKeypair() {
  mkdirSync(secretsDir, { recursive: true });
  const { privateKey } = generateKeyPairSync("ed25519");
  const pemPath = join(secretsDir, "mcp-registry-key.pem");
  writeFileSync(pemPath, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8");

  const seedHex = extractSeedHex(privateKey);
  const hexPath = join(secretsDir, "mcp-registry-key.hex");
  writeFileSync(hexPath, `${seedHex}\n`, "utf8");

  mkdirSync(dirname(authPath), { recursive: true });
  writeFileSync(authPath, `${authLineFromSeed(Buffer.from(seedHex, "hex"))}\n`, "utf8");

  console.log("Generated Ed25519 keypair:");
  console.log(`  Private (local only): ${pemPath}`);
  console.log(`  Private hex (Vercel env MCP_REGISTRY_PRIVATE_KEY_HEX): ${hexPath}`);
  console.log(`  Public auth file: ${authPath}`);
  console.log("");
  console.log("Next:");
  console.log("  1. Add MCP_REGISTRY_PRIVATE_KEY_HEX to Vercel → redeploy");
  console.log("  2. curl https://conc-exe.xyz/.well-known/mcp-registry-auth");
  console.log("  3. mcp-publisher login http --domain=conc-exe.xyz --private-key=<hex>");
  console.log("  4. mcp-publisher publish mcp-registry/server.json");
}

function writeAuthFromEnv() {
  const hex = process.env.MCP_REGISTRY_PRIVATE_KEY_HEX?.trim();
  if (!hex) return false;

  const line = authLineFromSeed(seedFromPrivateHex(hex));
  mkdirSync(dirname(authPath), { recursive: true });
  writeFileSync(authPath, `${line}\n`, "utf8");
  console.log(`mcp-registry-auth → ${authPath}`);
  return true;
}

if (process.argv.includes("--generate")) {
  generateKeypair();
  process.exit(0);
}

if (writeAuthFromEnv()) {
  process.exit(0);
}

if (existsSync(authPath)) {
  console.log(`mcp-registry-auth exists (no MCP_REGISTRY_PRIVATE_KEY_HEX set): ${authPath}`);
  process.exit(0);
}

console.error(
  "Skip mcp-registry-auth — set MCP_REGISTRY_PRIVATE_KEY_HEX or run with --generate (local only).",
);
