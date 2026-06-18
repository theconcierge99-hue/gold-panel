/**
 * Verify pre-launch vs post-launch env readiness.
 *
 *   node scripts/verify-launch-readiness.mjs --phase=pre
 *   node scripts/verify-launch-readiness.mjs --phase=post
 *   API_ORIGIN=https://conc-exe.xyz node scripts/verify-launch-readiness.mjs --phase=post --live
 */
const args = process.argv.slice(2);
const phaseArg = args.find((a) => a.startsWith("--phase="))?.split("=")[1] ?? "pre";
const live = args.includes("--live");
const phase = phaseArg === "post" ? "post" : "pre";

const checks = [];
function ok(label) {
  checks.push({ ok: true, label });
}
function fail(label) {
  checks.push({ ok: false, label });
}

const mint = (process.env.SOON_TOKEN_MINT ?? process.env.SOON_MINT ?? "").trim();
const solPay = (process.env.X402_SOL_PAY_TO ?? process.env.X402_SOL_PAY_ID ?? "").trim();
const evmPay = (process.env.X402_EVM_PAY_TO ?? process.env.X402_EVM_PAY_ID ?? "").trim();
const gemini = (process.env.GEMINI_API_KEY ?? "").trim();
const resourceKinds = (process.env.SOON_RESOURCE_KINDS ?? "concierge").trim();
const discount = Number(process.env.SOON_TOKEN_DISCOUNT_PERCENT ?? "0");
const x402Off = process.env.SOON_X402_ENABLED === "false";

if (gemini) ok("GEMINI_API_KEY is set");
else fail("GEMINI_API_KEY is missing");

if (solPay || evmPay) ok("At least one x402 pay-to wallet configured");
else fail("X402_SOL_PAY_TO or X402_EVM_PAY_TO required for paid APIs");

if (phase === "pre") {
  if (!mint) ok("SOON_TOKEN_MINT unset (pre-launch — UI shows Coming soon)");
  else fail("SOON_TOKEN_MINT is set — use --phase=post or unset for pre-launch");

  if (resourceKinds === "all") {
    fail("SOON_RESOURCE_KINDS=all — reserve for post-launch");
  } else {
    ok(`SOON_RESOURCE_KINDS=${resourceKinds || "concierge"} (pre-launch default)`);
  }

  if (!discount || discount <= 0) ok("SOON_TOKEN_DISCOUNT_PERCENT=0 (pre-launch)");
  else fail(`SOON_TOKEN_DISCOUNT_PERCENT=${discount} — enable after launch`);
} else {
  if (mint) ok(`SOON_TOKEN_MINT set (${mint.slice(0, 8)}…)`);
  else fail("SOON_TOKEN_MINT missing — paste mint from pump.fun launch");

  if (!x402Off) ok("SOON_X402_ENABLED is not false");
  else fail("SOON_X402_ENABLED=false — token pay disabled");

  if (resourceKinds === "all") ok("SOON_RESOURCE_KINDS=all (all 15 routes accept SOON)");
  else fail(`SOON_RESOURCE_KINDS=${resourceKinds} — post-launch snapshot expects 'all'`);

  if (discount >= 20 && discount <= 50) {
    ok(`SOON_TOKEN_DISCOUNT_PERCENT=${discount} (holder incentive active)`);
  } else if (discount > 0) {
    ok(`SOON_TOKEN_DISCOUNT_PERCENT=${discount} (custom — snapshot recommends 30)`);
  } else {
    fail("SOON_TOKEN_DISCOUNT_PERCENT=0 — set 30 in post-launch snapshot for holder discount");
  }

  if (solPay) ok("X402_SOL_PAY_TO set (SOON self-settle receives on Solana)");
  else fail("X402_SOL_PAY_TO required for SOON self-settle on Solana");
}

if (live) {
  const origin = (process.env.API_ORIGIN ?? "https://conc-exe.xyz").replace(/\/$/, "");
  try {
    const res = await fetch(`${origin}/api/x402-config`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      fail(`Live /api/x402-config returned ${res.status}`);
    } else {
      const soon = data.tokenPay?.default;
      if (phase === "post") {
        if (soon?.live) ok(`Live: tokenPay.default.live=true on ${origin}`);
        else fail(`Live: tokenPay.default.live=false on ${origin}`);
      } else {
        if (!soon?.live) ok(`Live: tokenPay.default.live=false (pre-launch) on ${origin}`);
        else fail(`Live: tokenPay.default.live=true — mint already live on ${origin}`);
      }
    }
  } catch (e) {
    fail(`Live check failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(c.ok ? "✓" : "✗", c.label);
}

console.log("");
if (failed.length) {
  console.error(`FAIL — ${failed.length} check(s) for phase=${phase}`);
  process.exit(1);
}
console.log(`OK — launch readiness (${phase}${live ? ", live" : ""})`);
