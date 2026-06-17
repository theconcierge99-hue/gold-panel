/**
 * Smoke test Token Pay preview API (run with dev server: npm run dev).
 */
const base = (process.env.API_ORIGIN ?? "http://localhost:8080").replace(/\/$/, "");

const sample = {
  merchant: {
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
  },
  resourceKind: "external",
};

const res = await fetch(`${base}/api/token-pay-preview`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(sample),
});

const data = await res.json();
if (!res.ok) {
  console.error("FAIL", res.status, data);
  process.exit(1);
}

console.log("status:", res.status);
console.log("valid:", data.valid);
console.log("errors:", data.errors ?? []);
console.log("readiness:", data.merchant?.readiness?.status);
console.log("envSnippet length:", data.envSnippet?.length ?? 0);

if (!data.envSnippet?.includes("TOKEN_PAY_MERCHANTS_JSON")) {
  console.error("FAIL: missing envSnippet");
  process.exit(1);
}

if (!Array.isArray(data.deploySteps) || data.deploySteps.length < 3) {
  console.error("FAIL: missing deploySteps");
  process.exit(1);
}

console.log("OK — token-pay-preview smoke test passed");
