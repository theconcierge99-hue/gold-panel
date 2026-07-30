/**
 * Poll the Dexter facilitator until BSC settlement is actually available, then stop.
 *
 * The BNB rail is pinned to Dexter because no other facilitator settles a liquid
 * BSC stablecoin, so `X402_BNB_ENABLED=true` is only safe once /supported reports
 * eip155:56 with the exact scheme and Permit2 transfer method.
 *
 * Usage:
 *   node scripts/watch-dexter-bnb.mjs                  # poll every 60s, forever
 *   node scripts/watch-dexter-bnb.mjs --interval=30     # poll every 30s
 *   node scripts/watch-dexter-bnb.mjs --once            # single check (CI/cron)
 *   node scripts/watch-dexter-bnb.mjs --max-minutes=120 # give up after 2h
 *
 * Exit codes: 0 = BSC ready, 1 = still down when the run ended.
 * Spends nothing and never flips the production flag itself.
 */
const DEXTER = "https://x402.dexter.cash";
const BSC_NETWORK = "eip155:56";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const once = process.argv.includes("--once");
const intervalMs = Math.max(5, Number(arg("interval", "60"))) * 1000;
const maxMinutes = Number(arg("max-minutes", "0"));
const deadline = maxMinutes > 0 ? Date.now() + maxMinutes * 60_000 : null;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/**
 * @returns {Promise<{ready: boolean, detail: string}>}
 */
async function checkDexter() {
  let res;
  try {
    res = await fetch(`${DEXTER}/supported`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ready: false, detail: `unreachable (${e instanceof Error ? e.message : e})` };
  }

  const text = await res.text();
  if (!res.ok) {
    // Cloudflare returns a plain-text error page when Dexter's origin is down.
    const hint = /error code: \d+/.test(text) ? " (Cloudflare edge up, origin down)" : "";
    return { ready: false, detail: `HTTP ${res.status}${hint}` };
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ready: false, detail: `non-JSON /supported (${res.status})` };
  }

  const kinds = Array.isArray(body?.kinds) ? body.kinds : [];
  const bsc = kinds.filter((k) => String(k?.network) === BSC_NETWORK);
  if (!bsc.length) {
    return { ready: false, detail: `up but ${BSC_NETWORK} not listed (${kinds.length} kinds)` };
  }

  const exact = bsc.find((k) => String(k?.scheme) === "exact");
  if (!exact) {
    return {
      ready: false,
      detail: `${BSC_NETWORK} listed but no exact scheme (${bsc.map((k) => k?.scheme).join(", ")})`,
    };
  }

  // Binance-Peg USDT/USDC expose neither EIP-3009 nor EIP-2612, so a missing
  // permit2 signal means our accepts would be unsettleable.
  const permit2 = /permit2/i.test(JSON.stringify(exact));
  if (!permit2) {
    return { ready: false, detail: `${BSC_NETWORK} exact present but no permit2 signal` };
  }

  return { ready: true, detail: `${BSC_NETWORK} exact + permit2 available` };
}

console.log(`Watching ${DEXTER}/supported for ${BSC_NETWORK}`);
console.log(once ? "Mode: single check\n" : `Mode: poll every ${intervalMs / 1000}s\n`);

let attempt = 0;
for (;;) {
  attempt += 1;
  const { ready, detail } = await checkDexter();
  console.log(`[${stamp()}] #${attempt} ${ready ? "READY" : "down"} — ${detail}`);

  if (ready) {
    console.log(`
Dexter can settle BSC again. Next steps:

  1. npm run x402:verify-bnb      # regression checks (no network spend)
  2. npm run x402:canary-bnb      # preflight against production
  3. Set X402_BNB_ENABLED=true in Vercel (Production) and redeploy
  4. Pay one live call with USDT or USDC on BNB, confirm the tx on bscscan.com
  5. Leave the flag on only after that settle returns 200 + PAYMENT-RESPONSE
`);
    process.exit(0);
  }

  if (once) {
    console.log("\nStill blocked — keep X402_BNB_ENABLED unset/false.");
    process.exit(1);
  }

  if (deadline && Date.now() + intervalMs > deadline) {
    console.log(`\nGave up after ${maxMinutes} minutes — keep X402_BNB_ENABLED unset/false.`);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, intervalMs));
}
