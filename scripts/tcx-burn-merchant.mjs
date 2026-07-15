#!/usr/bin/env node
/**
 * One-time TCX burn from merchant Token Pay wallet (Token-2022).
 *
 * Usage:
 *   node scripts/tcx-burn-merchant.mjs --dry-run
 *   node scripts/tcx-burn-merchant.mjs
 *
 * Private key (Phantom export — paste as-is into .secrets/tcx-merchant-key.json):
 *   - base58 string (most common from Phantom), OR
 *   - JSON array [12,34,56,...]
 *
 * Never commit the key file.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  burnChecked,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

const MINT = new PublicKey("F2bnJW1z55UQ9ZqGX5RwYQfvNJrd23n66eyBV5QZpump");
const MERCHANT_ATA = new PublicKey("6f2JW47bc7NSCM7m8TzTdv3gZkry92JABdwLaQubvd7b");
const BURN_PCT = 0.8;
const DECIMALS = 6;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

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

function parseSecretKeyBytes(raw) {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();

  // JSON array: [1,2,3,...]
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) throw new Error("JSON must be an array of numbers");
    return Uint8Array.from(arr);
  }

  // JSON string wrapper: "base58..."
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return parseSecretKeyBytes(trimmed.slice(1, -1));
  }

  // Comma-separated numbers without brackets: 1,2,3,...
  if (/^\d+\s*(,\s*\d+)+\s*$/.test(trimmed)) {
    return Uint8Array.from(trimmed.split(",").map((n) => Number(n.trim())));
  }

  // Base58 (Phantom default export)
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return bs58.decode(trimmed);
  }

  throw new Error(
    "Unrecognized key format. Paste Phantom private key (base58) or JSON array [1,2,3,...]",
  );
}

function loadSecretKey() {
  const keyPath = resolve(process.cwd(), ".secrets/tcx-merchant-key.json");
  const txtPath = resolve(process.cwd(), ".secrets/tcx-merchant-key.txt");
  const raw =
    process.env.MERCHANT_SECRET_KEY?.trim() ||
    (existsSync(keyPath) ? readFileSync(keyPath, "utf8").trim() : "") ||
    (existsSync(txtPath) ? readFileSync(txtPath, "utf8").trim() : "");

  if (!raw) {
    console.error(
      "Missing private key.\n" +
        "  Save Phantom export to: .secrets/tcx-merchant-key.json (or .txt)\n" +
        "  Paste base58 string OR JSON array [1,2,3,...]",
    );
    process.exit(1);
  }

  let bytes;
  try {
    bytes = parseSecretKeyBytes(raw);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    console.error(
      "\nPhantom tip: Settings -> account -> Export Private Key -> paste the long base58 string.",
    );
    process.exit(1);
  }

  if (bytes.length === 32) {
    return Keypair.fromSeed(bytes);
  }
  if (bytes.length === 64) {
    return Keypair.fromSecretKey(bytes);
  }

  console.error(`Expected 32- or 64-byte secret key, got ${bytes.length} bytes.`);
  process.exit(1);
}

function fmtTcx(atomic) {
  return (Number(atomic) / 10 ** DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: DECIMALS,
  });
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const rpc = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
  const keypair = loadSecretKey();
  const conn = new Connection(rpc, "confirmed");

  console.log("Merchant wallet:", keypair.publicKey.toBase58());
  console.log("Token account:  ", MERCHANT_ATA.toBase58());
  console.log("Mint:           ", MINT.toBase58());
  console.log("RPC:            ", rpc);
  console.log("");

  const acct = await getAccount(conn, MERCHANT_ATA, undefined, TOKEN_2022_PROGRAM_ID);
  const balance = acct.amount;
  const burnAmount = BigInt(Math.floor(Number(balance) * BURN_PCT));

  console.log("Balance:        ", fmtTcx(balance), "TCX");
  console.log("Burn (80%):     ", fmtTcx(burnAmount), "TCX");
  console.log("Treasury (20%): ", fmtTcx(balance - burnAmount), "TCX (stays in wallet)");
  console.log("");

  if (burnAmount <= 0n) {
    console.error("Nothing to burn.");
    process.exit(1);
  }

  if (dryRun) {
    console.log("DRY RUN — no transaction sent. Remove --dry-run to burn.");
    return;
  }

  console.log("Sending burn transaction...");
  const sig = await burnChecked(
    conn,
    keypair,
    MERCHANT_ATA,
    MINT,
    keypair,
    burnAmount,
    DECIMALS,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );

  console.log("");
  console.log("Burn TX:", sig);
  console.log("Solscan:", `https://solscan.io/tx/${sig}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
