/**
 * Live smoke checks — Token Pay platform (partner / external project monetization).
 * Usage: node scripts/smoke-token-pay-live.mjs [origin]
 */
const origin = (process.argv[2] ?? "https://conc-exe.xyz").replace(/\/$/, "");
const headers = { Accept: "application/json", Origin: origin };

const checks = [];

async function check(label, fn) {
  try {
    await fn();
    checks.push({ ok: true, label });
    console.log("OK  ", label);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.push({ ok: false, label, msg });
    console.log("FAIL", label, "—", msg);
  }
}

const sampleMerchant = {
  id: "acme",
  symbol: "ACME",
  name: "Acme Token",
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  decimals: 6,
  payTo: "11111111111111111111111111111112",
  priceSource: "env",
  fallbackUsd: 0.001,
  resourceKinds: ["external", "concierge"],
  allowedOrigins: ["https://api.acme.xyz"],
};

await check("GET /api/token-pay platform registry", async () => {
  const res = await fetch(`${origin}/api/token-pay`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.platform?.name?.includes("Token Pay")) throw new Error("missing platform meta");
  if (!Array.isArray(data.merchants) || !data.merchants.length) throw new Error("no merchants");
  if (!data.verify?.buildAcceptUrl || !data.verify?.partnerVerifyUrl) {
    throw new Error("missing partner verify links");
  }
});

await check("GET /api/token-pay?merchant=soon", async () => {
  const res = await fetch(`${origin}/api/token-pay?merchant=soon`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (data.merchant?.id !== "soon") throw new Error(`merchant=${data.merchant?.id}`);
  if (!data.merchant?.readiness) throw new Error("missing readiness");
  if (!data.merchant?.verify?.buildAcceptUrl) throw new Error("missing buildAcceptUrl");
});

await check("x402-config tokenPay + soonX402 blocks", async () => {
  const res = await fetch(`${origin}/api/x402-config`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.tokenPay?.platform) throw new Error("tokenPay.platform missing");
  if (!data.tokenPay?.merchants?.length) throw new Error("tokenPay.merchants empty");
  const soon = data.tokenPay.merchants.find((m) => m.id === "soon");
  if (!soon) throw new Error("SOON merchant missing from x402-config");
  if (data.soonX402?.enabled !== false && data.soonX402?.mint == null) {
    // pre-launch: SOON not live yet is OK
  }
});

await check("POST /api/token-pay-preview (wizard)", async () => {
  const res = await fetch(`${origin}/api/token-pay-preview`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ merchant: sampleMerchant, resourceKind: "external" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.envSnippet?.includes("TOKEN_PAY_MERCHANTS_JSON")) {
    throw new Error("missing envSnippet");
  }
  if (!Array.isArray(data.deploySteps) || data.deploySteps.length < 3) {
    throw new Error("missing deploySteps");
  }
  if (!data.merchant?.readiness) throw new Error("missing readiness in preview");
});

await check("GET /api/token-pay-build-accept (soon, pre-launch expected)", async () => {
  const res = await fetch(
    `${origin}/api/token-pay-build-accept?merchant=soon&usd=0.1&resourceUrl=https://example.com/api`,
    { headers },
  );
  const data = await res.json();
  // SOON pre-launch: merchant not live → 400/404 is expected; route must respond JSON not crash
  if (res.status === 404 || res.status === 400) {
    if (!data.error) throw new Error(`HTTP ${res.status} without error body`);
    return;
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.accept?.asset || !data.accept?.payTo) throw new Error("missing accept object");
  if (!data.links?.verifyUrl) throw new Error("missing verifyUrl");
});

await check("POST /api/token-pay-verify → 402 without signature", async () => {
  const res = await fetch(`${origin}/api/token-pay-verify`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ merchantId: "soon", usdAmount: 0.1 }),
  });
  const data = await res.json();
  if (res.status !== 402 && res.status !== 400) {
    throw new Error(`expected 402/400, got ${res.status}: ${JSON.stringify(data).slice(0, 120)}`);
  }
  if (String(data.error || "").toLowerCase().includes("function_invocation")) {
    throw new Error("route crashed");
  }
});

await check("GET /api/token-pay-analytics index", async () => {
  const res = await fetch(`${origin}/api/token-pay-analytics`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!Array.isArray(data.merchants)) throw new Error("merchants list missing");
});

await check("GET /api/token-pay-analytics?merchant=soon", async () => {
  const res = await fetch(`${origin}/api/token-pay-analytics?merchant=soon`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (data.merchantId !== "soon") throw new Error("wrong merchantId");
  if (!data.analytics || !data.readiness) throw new Error("missing analytics/readiness");
});

await check("Concierge 402 includes USDC accept (x402 core)", async () => {
  const res = await fetch(`${origin}/api/concierge`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "chat", message: "ping", history: [], market: [] }),
  });
  const payHdr = res.headers.get("payment-required") || res.headers.get("PAYMENT-REQUIRED");
  const data = await res.json();
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
  if (!payHdr && !data.detail) throw new Error("missing PAYMENT-REQUIRED flow");
});

await check("GET /.well-known/x402 discovery", async () => {
  const res = await fetch(`${origin}/.well-known/x402`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const resources = data.resources ?? data.accepts ?? [];
  const hasConcierge = JSON.stringify(data).includes("concierge");
  if (!hasConcierge && !resources.length) throw new Error("discovery payload empty");
});

await check("pay.sh PAY.md catalog (local repo)", async () => {
  const { execSync } = await import("node:child_process");
  execSync("npm run paysh:validate:token-pay", { stdio: "pipe", cwd: process.cwd() });
});

await check("Agent token-pay docs page", async () => {
  const res = await fetch(`${origin}/docs/payment/token-pay`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes("Token Pay") && !html.includes("token-pay")) {
    throw new Error("docs page missing Token Pay content");
  }
});

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(" -", f.label, ":", f.msg);
}
process.exit(failed.length ? 1 : 0);
