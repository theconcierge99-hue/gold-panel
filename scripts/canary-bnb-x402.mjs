/**
 * Live canary checklist for enabling BNB x402 (X402_BNB_ENABLED=true).
 * Run after deploy with flag still OFF, then flip the flag only when all steps pass.
 *
 * Usage:
 *   node scripts/canary-bnb-x402.mjs
 *   node scripts/canary-bnb-x402.mjs --origin=https://conc-exe.xyz
 *
 * Does not spend funds. Prints manual steps for a paid settle canary.
 */
const origin = (
  process.argv.find((a) => a.startsWith("--origin="))?.slice("--origin=".length) ||
  process.env.ORIGIN ||
  "https://conc-exe.xyz"
).replace(/\/$/, "");

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const DEXTER = "https://x402.dexter.cash";

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.log(`  ✗ ${msg}`);
}
function info(msg) {
  console.log(`  · ${msg}`);
}

async function jsonGet(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { res, text, body };
}

console.log(`\nBNB x402 canary against ${origin}\n`);

let hardFail = false;

// 1) Dexter /supported
console.log("1) Dexter facilitator /supported");
try {
  const { res, body, text } = await jsonGet(`${DEXTER}/supported`);
  if (!res.ok) {
    fail(`HTTP ${res.status} — do NOT enable X402_BNB_ENABLED until Dexter recovers`);
    hardFail = true;
  } else {
    const blob = typeof body === "object" ? JSON.stringify(body) : text;
    const has56 = /eip155:56/.test(blob);
    const hasPermit2 = /permit2/i.test(blob);
    if (has56) ok("eip155:56 listed");
    else {
      fail("eip155:56 missing from /supported");
      hardFail = true;
    }
    if (hasPermit2) ok("permit2 present");
    else fail("permit2 not found in /supported body");
  }
} catch (e) {
  fail(`Dexter unreachable: ${e instanceof Error ? e.message : e}`);
  hardFail = true;
}

// 2) On-chain decimals for both Binance-Peg assets
console.log("\n2) Binance-Peg decimals (expect 18 for both)");
async function bscCall(to, data) {
  const rpcRes = await fetch("https://bsc-dataseed.binance.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return rpcRes.json();
}

for (const [symbol, address] of [
  ["USDT", USDT],
  ["USDC", USDC],
]) {
  try {
    const rpc = await bscCall(address, "0x313ce567");
    const dec = parseInt(rpc.result, 16);
    if (dec === 18) ok(`${symbol} decimals=${dec}`);
    else {
      fail(`${symbol} decimals=${dec} (expected 18)`);
      hardFail = true;
    }
    // Neither Binance-Peg token implements EIP-3009/EIP-2612, which is why the rail
    // must stay on Permit2. A token that suddenly exposes one means our accept
    // metadata needs revisiting.
    const domain = await bscCall(address, "0x3644e515");
    if (!domain.error && domain.result && domain.result !== "0x") {
      info(`${symbol} now exposes DOMAIN_SEPARATOR — revisit the Permit2 assumption`);
    }
  } catch (e) {
    fail(`${symbol} RPC error: ${e instanceof Error ? e.message : e}`);
    hardFail = true;
  }
}

// 3) Production config still fail-closed unless flag set
console.log("\n3) Production /api/x402-config");
try {
  const { res, body } = await jsonGet(`${origin}/api/x402-config`);
  if (!res.ok) {
    fail(`HTTP ${res.status}`);
    hardFail = true;
  } else {
    info(`acceptsBnb=${body?.acceptsBnb}`);
    info(`bnbNetwork=${body?.bnbNetwork ?? "—"}`);
    info(`bnbAssetTransferMethod=${body?.bnbAssetTransferMethod ?? "—"}`);
    info(`bnbUsdt=${body?.bnbUsdt ?? "—"}`);
    info(`bnbUsdc=${body?.bnbUsdc ?? "— (USDT only)"}`);
    if (body?.acceptsBnb) {
      ok("BNB rail is LIVE on this origin");
      if (body.bnbNetwork !== "eip155:56") {
        fail(`unexpected bnbNetwork ${body.bnbNetwork}`);
        hardFail = true;
      }
      if (body.bnbAssetTransferMethod !== "permit2") {
        fail("expected permit2 transfer method");
        hardFail = true;
      }
      if (!body.bnbUsdt) {
        fail("bnbUsdt missing — browser client cannot offer the rail");
        hardFail = true;
      }
    } else {
      ok("BNB still fail-closed (X402_BNB_ENABLED not true) — expected before canary settle");
    }
  }
} catch (e) {
  fail(`config fetch: ${e instanceof Error ? e.message : e}`);
  hardFail = true;
}

console.log(`
4) Manual paid canary (after setting X402_BNB_ENABLED=true on staging/mainnet):
   a. GET ${origin}/api/x402-config → acceptsBnb=true, bnbNetwork=eip155:56
   b. POST ${origin}/api/concierge-intel-tvl without payment → decode PAYMENT-REQUIRED
      expect TWO accepts on network eip155:56 — one per asset:
        USDT ${USDT}
        USDC ${USDC}
      each with amount 18-decimal (e.g. 0.02 USD → 20000000000000000)
      and extra.assetTransferMethod=permit2
   c. Pay once with USDT and once with USDC (Lounge or @x402/evm exact client)
      — first call per token prompts a Permit2 approve (sponsored via Dexter if extension present)
   d. Confirm both settle txs on https://bscscan.com and 200 + PAYMENT-RESPONSE
   e. Only then leave X402_BNB_ENABLED=true in production

${hardFail ? "RESULT: BLOCKED — keep X402_BNB_ENABLED unset/false" : "RESULT: preflight OK — proceed to manual settle canary when ready"}
`);

process.exit(hardFail ? 1 : 0);
