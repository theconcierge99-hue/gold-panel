/**
 * TCX Telegram trade alert bot — posts buys/sells ≥ MIN_SOL to a channel.
 *
 * Run locally (or any always-on host) after mint is live. Not Vercel — needs a long poll loop.
 *
 * Setup:
 *   1. @BotFather → create bot → TELEGRAM_BOT_TOKEN
 *   2. Add bot as admin on channel → TELEGRAM_CHANNEL=@Theconcierge33
 *   3. Helius free tier → HELIUS_API_KEY (enhanced tx parsing)
 *   4. After Pump.fun launch → TCX_MINT=<base58>
 *
 *   PowerShell:
 *     $env:TELEGRAM_BOT_TOKEN="..."
 *     $env:TELEGRAM_CHANNEL="@Theconcierge33"
 *     $env:HELIUS_API_KEY="..."
 *     $env:TCX_MINT="..."
 *     $env:MIN_SOL="1"
 *     node scripts/tcx-telegram-trade-bot.mjs
 *
 * Optional: POLL_MS=12000 STATE_FILE=.tcx-whale-bot-state.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
const TELEGRAM_CHANNEL = (process.env.TELEGRAM_CHANNEL ?? "").trim();
const HELIUS_API_KEY = (process.env.HELIUS_API_KEY ?? "").trim();
const TCX_MINT = (process.env.TCX_MINT ?? process.env.SOON_TOKEN_MINT ?? "").trim();
const MIN_SOL = Number(process.env.MIN_SOL ?? "1");
const POLL_MS = Math.max(8000, Number(process.env.POLL_MS ?? "15000"));
const STATE_FILE =
  process.env.STATE_FILE?.trim() || join(repoRoot, ".tcx-whale-bot-state.json");

const LAMPORTS_PER_SOL = 1_000_000_000;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN) die("Missing TELEGRAM_BOT_TOKEN");
if (!TELEGRAM_CHANNEL) die("Missing TELEGRAM_CHANNEL (e.g. @Theconcierge33)");
if (!HELIUS_API_KEY) die("Missing HELIUS_API_KEY — get one at helius.dev");
if (!TCX_MINT) die("Missing TCX_MINT (set after Pump.fun launch)");
if (!Number.isFinite(MIN_SOL) || MIN_SOL <= 0) die("MIN_SOL must be > 0");

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { seen: {}, watchAddresses: [], bondingCurve: null, startedAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { seen: {}, watchAddresses: [], bondingCurve: null, startedAt: new Date().toISOString() };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function short(addr) {
  if (!addr || addr.length < 12) return addr ?? "?";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function solscanTx(sig) {
  return `https://solscan.io/tx/${sig}`;
}

function pumpFunCoin(mint) {
  return `https://pump.fun/coin/${mint}`;
}

async function fetchPumpBondingCurve(mint) {
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.bonding_curve ?? data?.bondingCurve ?? null;
  } catch {
    return null;
  }
}

async function fetchHeliusTransactions(address) {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set("api-key", HELIUS_API_KEY);
  url.searchParams.set("limit", "25");
  url.searchParams.set("type", "SWAP");

  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Helius ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Also fetch without type filter — pump.fun curve txs may not tag as SWAP. */
async function fetchHeliusTransactionsAny(address) {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set("api-key", HELIUS_API_KEY);
  url.searchParams.set("limit", "15");

  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) return [];
  return res.json();
}

function lamportsToSol(lamports) {
  return Number(lamports || 0) / LAMPORTS_PER_SOL;
}

/**
 * Parse Helius enhanced tx for TCX mint involvement + SOL size + side.
 * @returns {{ side: 'buy'|'sell', sol: number, trader: string|null, signature: string } | null}
 */
function parseTrade(tx, mint) {
  const signature = tx?.signature;
  if (!signature) return null;

  const tokenTransfers = Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : [];
  const mintHits = tokenTransfers.filter(
    (t) => t.mint === mint || t.tokenMint === mint,
  );
  if (!mintHits.length && !tx?.accountData?.some?.((a) => a.account === mint)) {
    // Still allow if native SOL moved heavily on a pump curve account watch
    const desc = `${tx.description ?? ""} ${tx.type ?? ""}`.toLowerCase();
    if (!desc.includes("swap") && tx.type !== "SWAP" && tx.type !== "UNKNOWN") {
      const anyMintInEvents = (tx.events?.swap?.tokenOutputs ?? []).some(
        (o) => o.mint === mint,
      );
      if (!anyMintInEvents) return null;
    }
  }

  const nativeTransfers = Array.isArray(tx.nativeTransfers) ? tx.nativeTransfers : [];
  let maxNativeSol = 0;
  for (const nt of nativeTransfers) {
    const sol = lamportsToSol(nt.amount);
    if (sol > maxNativeSol) maxNativeSol = sol;
  }

  // Swap events (Jupiter / PumpSwap post-grad)
  const swap = tx.events?.swap;
  if (swap?.nativeInput?.amount) {
    maxNativeSol = Math.max(maxNativeSol, lamportsToSol(swap.nativeInput.amount));
  }
  if (swap?.nativeOutput?.amount) {
    maxNativeSol = Math.max(maxNativeSol, lamportsToSol(swap.nativeOutput.amount));
  }

  if (maxNativeSol < MIN_SOL) return null;

  let side = "buy";
  let trader = tx.feePayer ?? null;

  if (mintHits.length) {
    const userReceived = mintHits.find((t) => t.toUserAccount && t.toUserAccount !== t.fromUserAccount);
    const userSent = mintHits.find((t) => t.fromUserAccount && t.fromUserAccount === tx.feePayer);
    if (userReceived?.toUserAccount) {
      side = "buy";
      trader = userReceived.toUserAccount;
    } else if (userSent) {
      side = "sell";
      trader = userSent.fromUserAccount;
    } else {
      const netToUser = mintHits.find((t) => t.toUserAccount);
      if (netToUser) {
        side = "buy";
        trader = netToUser.toUserAccount;
      } else {
        side = "sell";
        trader = mintHits[0]?.fromUserAccount ?? trader;
      }
    }
  } else if (swap) {
    const outMint = swap.tokenOutputs?.[0]?.mint;
    const inMint = swap.tokenInputs?.[0]?.mint;
    if (outMint === mint) side = "buy";
    else if (inMint === mint) side = "sell";
  }

  return { side, sol: maxNativeSol, trader, signature };
}

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHANNEL,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram HTTP ${res.status}`);
  }
  return data;
}

function formatAlert({ side, sol, trader, signature }) {
  const emoji = side === "buy" ? "🟢" : "🔴";
  const label = side === "buy" ? "BUY" : "SELL";
  const solStr = sol >= 10 ? sol.toFixed(2) : sol.toFixed(3);
  return (
    `${emoji} <b>TCX ${label}</b> · <b>${solStr} SOL</b>\n` +
    `Wallet: <code>${short(trader)}</code>\n` +
    `<a href="${solscanTx(signature)}">Solscan</a> · ` +
    `<a href="${pumpFunCoin(TCX_MINT)}">Pump</a>`
  );
}

async function pollOnce(state, { drySeed = false } = {}) {
  const addresses = [...new Set([TCX_MINT, ...state.watchAddresses].filter(Boolean))];
  /** @type {Map<string, ReturnType<typeof parseTrade>>} */
  const candidates = new Map();

  for (const address of addresses) {
    let batches = [];
    try {
      batches.push(await fetchHeliusTransactions(address));
    } catch (e) {
      console.warn(`[warn] SWAP fetch ${short(address)}:`, e.message);
    }
    try {
      batches.push(await fetchHeliusTransactionsAny(address));
    } catch (e) {
      console.warn(`[warn] tx fetch ${short(address)}:`, e.message);
    }

    for (const batch of batches) {
      if (!Array.isArray(batch)) continue;
      for (const tx of batch) {
        const parsed = parseTrade(tx, TCX_MINT);
        if (parsed && !candidates.has(parsed.signature)) {
          candidates.set(parsed.signature, parsed);
        }
      }
    }
  }

  const newTrades = [...candidates.values()].filter((t) => !state.seen[t.signature]);

  if (drySeed) {
    for (const trade of newTrades) {
      state.seen[trade.signature] = { at: new Date().toISOString(), seeded: true, ...trade };
    }
    if (newTrades.length) saveState(state);
    console.log(`[seed] marked ${newTrades.length} existing tx(s) — alerts start from next poll`);
    return;
  }

  for (const trade of newTrades) {
    const msg = formatAlert(trade);
    await sendTelegram(msg);
    state.seen[trade.signature] = { at: new Date().toISOString(), ...trade };
    console.log(`[post] ${trade.side} ${trade.sol.toFixed(3)} SOL ${trade.signature.slice(0, 8)}…`);
    await sleep(1200);
  }

  if (newTrades.length) saveState(state);

  // Trim seen map (keep last 500)
  const keys = Object.keys(state.seen);
  if (keys.length > 500) {
    for (const k of keys.slice(0, keys.length - 500)) delete state.seen[k];
    saveState(state);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const state = loadState();

  if (!state.watchAddresses?.length) {
    const curve = await fetchPumpBondingCurve(TCX_MINT);
    state.bondingCurve = curve;
    state.watchAddresses = curve ? [curve] : [];
    saveState(state);
    console.log(`[init] mint=${TCX_MINT}`);
    console.log(`[init] bonding_curve=${curve ?? "(not found — mint-only watch)"}`);
  }

  console.log(`[init] channel=${TELEGRAM_CHANNEL} min=${MIN_SOL} SOL poll=${POLL_MS}ms`);
  console.log(`[init] state=${STATE_FILE}`);

  await sendTelegram(
    `📡 <b>TCX trade alerts ON</b>\n` +
      `Posting ${MIN_SOL}+ SOL buys & sells\n` +
      `Mint: <code>${short(TCX_MINT)}</code>\n` +
      `<a href="${pumpFunCoin(TCX_MINT)}">Pump.fun</a>`,
  ).catch((e) => console.warn("[warn] startup ping failed:", e.message));

  const firstRun = !existsSync(STATE_FILE);
  if (firstRun) {
    await pollOnce(state, { drySeed: true });
  }

  while (true) {
    try {
      await pollOnce(state);
    } catch (e) {
      console.error("[error]", e instanceof Error ? e.message : e);
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
