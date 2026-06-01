#!/usr/bin/env node
/**
 * Mint Solana NFT for a published signal (local / CI).
 * Usage: node scripts/remint-signal-sol.mjs sig_abc123
 * Requires: RWA_MINT_SOL_SECRET, KV_REST_* or call production API after deploy.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const signalId = process.argv[2]?.trim();
if (!signalId) {
  console.error("Usage: node scripts/remint-signal-sol.mjs <signalId>");
  process.exit(1);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const origin = (process.env.X402_SITE_ORIGIN || "https://conc-exe.xyz").replace(/\/$/, "");
const secret =
  process.env.LOUNGE_INTERNAL_KEY?.trim() || process.env.RWA_MINT_INTERNAL_KEY?.trim();

async function main() {
  const headers = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const res = await fetch(`${origin}/api/lounge-rwa-mint-sol`, {
    method: "POST",
    headers,
    body: JSON.stringify({ signalId }),
  });
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
