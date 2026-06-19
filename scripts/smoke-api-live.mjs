/**
 * Live smoke checks for Concierge public APIs (no payment / secrets).
 * Usage: node scripts/smoke-api-live.mjs [origin]
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

await check("deploy-version.txt", async () => {
  const res = await fetch(`${origin}/deploy-version.txt`);
  const text = (await res.text()).trim();
  if (!res.ok || !/^[0-9a-f]{7,40}$/i.test(text)) throw new Error(`bad version (${res.status}): ${text}`);
});

await check("GET /api/market", async () => {
  const res = await fetch(`${origin}/api/market`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!Array.isArray(data.ticks) || !data.ticks.length) throw new Error("missing ticks");
});

await check("GET /api/x402-config", async () => {
  const res = await fetch(`${origin}/api/x402-config`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.creatorPoints?.enabled) throw new Error("creatorPoints disabled");
});

await check("POST /api/concierge → 402", async () => {
  const res = await fetch(`${origin}/api/concierge`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "chat", message: "ping", history: [], market: [] }),
  });
  const data = await res.json();
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}: ${JSON.stringify(data).slice(0, 120)}`);
  if (String(data.error || "").toLowerCase().includes("function_invocation")) {
    throw new Error("concierge route crashed");
  }
});

await check("POST /api/lounge-signal-publish → 402 $0.02 label", async () => {
  const res = await fetch(`${origin}/api/lounge-signal-publish`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "t", summary: "s", categories: ["Crypto"] }),
  });
  const data = await res.json();
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
  if (data.priceUsdc !== 0.02) throw new Error(`priceUsdc=${data.priceUsdc}`);
  if (data.priceLabel !== "$0.02") throw new Error(`priceLabel=${data.priceLabel}`);
});

await check("GET /api/creator-points requires wallet", async () => {
  const res = await fetch(`${origin}/api/creator-points`, { headers });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

await check("GET /api/rwa-badges requires wallet", async () => {
  const res = await fetch(`${origin}/api/rwa-badges`, { headers });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
