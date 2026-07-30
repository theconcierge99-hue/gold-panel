#!/usr/bin/env node
/**
 * Reconcile Token Pay analytics against Solana mainnet.
 *
 * Settlements used to be recorded on broadcast success, so dropped transactions
 * inflated totals, daily rollups, and the TCX transparency ledger. This drops
 * every recorded settlement whose signature never landed on-chain.
 *
 * Usage:
 *   node scripts/tcx-reconcile-analytics.mjs --dry-run
 *   node scripts/tcx-reconcile-analytics.mjs
 *
 * Requires KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) in the
 * environment or .env.local — e.g. `npx vercel env pull .env.local`.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Connection } from "@solana/web3.js";

const MAX_RECENT = 40;
const STATUS_BATCH = 25;

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

function kvConfig() {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) {
    console.error(
      "Missing KV credentials.\n" +
        "  Set KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*)\n" +
        "  Tip: npx vercel link && npx vercel env pull .env.local",
    );
    process.exit(1);
  }
  return { url: url.replace(/\/+$/, ""), token };
}

/** Upstash REST takes the command as a JSON array of arguments. */
async function kvCommand(cfg, command) {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`KV ${command[0]} failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.error) throw new Error(`KV ${command[0]} failed: ${body.error}`);
  return body.result;
}

/** @vercel/kv stores objects as JSON, but returns them already parsed on some tiers. */
function decodeRecord(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function utcDateKey(at) {
  return new Date(at).toISOString().slice(0, 10);
}

function fmtTcx(atomic, decimals = 6) {
  return (Number(atomic) / 10 ** decimals).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

async function findMissingSignatures(conn, signatures) {
  const missing = new Set();
  for (let i = 0; i < signatures.length; i += STATUS_BATCH) {
    const batch = signatures.slice(i, i + STATUS_BATCH);
    const { value } = await conn.getSignatureStatuses(batch, {
      searchTransactionHistory: true,
    });
    batch.forEach((sig, idx) => {
      const status = value[idx];
      if (!status || status.err) missing.add(sig);
    });
  }
  return missing;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const cfg = kvConfig();
  const merchantId = (process.env.TCX_TRANSPARENCY_MERCHANT ?? "soon").trim() || "soon";
  const rpc = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
  const conn = new Connection(rpc, "confirmed");

  const recentKey = `token-pay:recent:${merchantId}`;
  const totalsKey = `token-pay:totals:${merchantId}`;

  console.log("Merchant:", merchantId);
  console.log("RPC:     ", rpc);
  console.log("");

  const rawRecent = (await kvCommand(cfg, ["LRANGE", recentKey, "0", String(MAX_RECENT - 1)])) ?? [];
  const records = rawRecent.map(decodeRecord);
  if (records.some((r) => !r)) {
    console.error("Some recent entries could not be parsed — aborting to avoid data loss.");
    process.exit(1);
  }
  if (!records.length) {
    console.log("No recent settlements recorded. Nothing to reconcile.");
    return;
  }

  const missing = await findMissingSignatures(
    conn,
    records.map((r) => r.tx),
  );
  const invalid = records.filter((r) => missing.has(r.tx));
  const valid = records.filter((r) => !missing.has(r.tx));

  console.log(`Recent settlements: ${records.length}`);
  console.log(`Confirmed on-chain: ${valid.length}`);
  console.log(`Not found on-chain: ${invalid.length}`);
  console.log("");

  if (!invalid.length) {
    console.log("Analytics already match the chain. Nothing to do.");
    return;
  }

  const perDay = new Map();
  let totalAmount = 0n;
  let totalList = 0n;
  let totalEffective = 0n;

  for (const row of invalid) {
    const date = utcDateKey(row.at);
    const day = perDay.get(date) ?? { txCount: 0, amount: 0n, list: 0n, effective: 0n };
    const amount = BigInt(row.amountAtomic ?? "0");
    const list = BigInt(Math.max(0, Math.round(row.listUsdcMicro ?? 0)));
    const effective = BigInt(Math.max(0, Math.round(row.effectiveUsdcMicro ?? row.listUsdcMicro ?? 0)));
    perDay.set(date, {
      txCount: day.txCount + 1,
      amount: day.amount + amount,
      list: day.list + list,
      effective: day.effective + effective,
    });
    totalAmount += amount;
    totalList += list;
    totalEffective += effective;
    console.log(`  drop ${date} ${row.resourceKind} ${fmtTcx(amount)} TCX  ${row.tx}`);
  }

  console.log("");
  console.log("Totals to subtract:");
  console.log("  txCount:  ", invalid.length);
  console.log("  volume:   ", fmtTcx(totalAmount), "TCX");
  console.log("  list USD: ", (Number(totalList) / 1e6).toFixed(2));
  console.log("  eff. USD: ", (Number(totalEffective) / 1e6).toFixed(2));
  console.log("");

  if (dryRun) {
    console.log("DRY RUN — KV untouched. Remove --dry-run to apply.");
    return;
  }

  for (const [date, day] of perDay) {
    const dayKey = `token-pay:daily:${merchantId}:${date}`;
    const current = decodeRecord(await kvCommand(cfg, ["GET", dayKey]));
    if (!current) continue;
    const next = {
      txCount: Math.max(0, (current.txCount ?? 0) - day.txCount),
      volumeAtomic: bigMax0(BigInt(current.volumeAtomic ?? "0") - day.amount).toString(),
      listUsdcMicro: bigMax0(BigInt(current.listUsdcMicro ?? "0") - day.list).toString(),
      effectiveUsdcMicro: bigMax0(BigInt(current.effectiveUsdcMicro ?? "0") - day.effective).toString(),
    };
    await kvCommand(cfg, ["SET", dayKey, JSON.stringify(next)]);
    console.log(`daily ${date} -> ${next.txCount} tx, ${fmtTcx(BigInt(next.volumeAtomic))} TCX`);
  }

  const totals = decodeRecord(await kvCommand(cfg, ["GET", totalsKey]));
  if (totals) {
    const newest = valid[0] ?? null;
    const next = {
      txCount: Math.max(0, (totals.txCount ?? 0) - invalid.length),
      volumeAtomic: bigMax0(BigInt(totals.volumeAtomic ?? "0") - totalAmount).toString(),
      listUsdcMicro: bigMax0(BigInt(totals.listUsdcMicro ?? "0") - totalList).toString(),
      effectiveUsdcMicro: bigMax0(BigInt(totals.effectiveUsdcMicro ?? "0") - totalEffective).toString(),
      lastTxAt: missing.has(totals.lastTx) ? (newest?.at ?? null) : totals.lastTxAt,
      lastTx: missing.has(totals.lastTx) ? (newest?.tx ?? null) : totals.lastTx,
    };
    await kvCommand(cfg, ["SET", totalsKey, JSON.stringify(next)]);
    console.log(`totals -> ${next.txCount} tx, ${fmtTcx(BigInt(next.volumeAtomic))} TCX`);
  }

  await kvCommand(cfg, ["DEL", recentKey]);
  if (valid.length) {
    // LPUSH prepends, so replay oldest first to keep newest at index 0.
    for (const row of [...valid].reverse()) {
      await kvCommand(cfg, ["LPUSH", recentKey, JSON.stringify(row)]);
    }
  }
  console.log(`recent -> ${valid.length} entries`);

  console.log("");
  console.log("Done. Transparency cache refreshes within the hour, or hit");
  console.log("https://conc-exe.xyz/api/tcx-transparency?live=1 to verify now.");
}

function bigMax0(v) {
  return v > 0n ? v : 0n;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
