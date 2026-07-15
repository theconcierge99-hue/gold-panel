import { createConciergeAgent, CATALOG, PaymentRequiredError } from "../packages/agent/dist/index.js";
import handleMcp from "../backend/concierge-api/routes/mcp.ts";
import { CONCIERGE_STATIC_REWRITES } from "../backend/concierge-static-routes.ts";
import { readFileSync, existsSync } from "fs";

const fails = [];
function ok(name, cond, detail = "") {
  if (cond) console.log("PASS", name, detail);
  else {
    console.log("FAIL", name, detail);
    fails.push(name);
  }
}

// --- Agent SDK ---
ok("catalog size", CATALOG.length === 24, String(CATALOG.length));
const agent = createConciergeAgent();
ok("url macro", agent.url("intel-macro").endsWith("/api/concierge-intel-macro"));
ok("payCurl", agent.payCurl("intel-macro").includes("pay curl"));

const snap = await agent.discover({ includeOpenApi: true });
ok("discover catalog", snap.catalog.length === 24, String(snap.catalog.length));
ok("discover mcp", snap.mcpUrl === "https://conc-exe.xyz/api/mcp");
ok("discover openapi", Boolean(snap.openapi?.openapi));
ok("discover agentCard", Boolean(snap.agentCard));

// unpaid call without settle → PaymentRequiredError OR success if x402 off
try {
  await agent.call("intel-macro", {});
  ok("call unpaid (dev-bypass OK)", true, "x402 may be off locally/prod free path");
} catch (e) {
  ok("call unpaid PaymentRequiredError", e instanceof PaymentRequiredError, e?.name || String(e));
}

// --- MCP ---
async function rpc(method, params) {
  const req = new Request("https://conc-exe.xyz/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", host: "conc-exe.xyz", "x-forwarded-proto": "https" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return await (await handleMcp(req)).json();
}

const init = await rpc("initialize");
ok("mcp version", init.result?.serverInfo?.version === "1.1.0", init.result?.serverInfo?.version);
const list = await rpc("tools/list");
const names = (list.result?.tools || []).map((t) => t.name);
ok("mcp free tools", names.includes("concierge_catalog") && names.includes("concierge_prepare_payment"), names.filter(n => n.startsWith("concierge_")).join(","));
ok("mcp paid tools", names.includes("intel_macro") && names.includes("security_scan"));
const cat = await rpc("tools/call", { name: "concierge_catalog", arguments: { prefix: "intel" } });
const catJson = JSON.parse(cat.result.content[0].text);
ok("mcp catalog", catJson.tools?.length >= 10 && catJson.sdk === "@conc-exe/agent", String(catJson.tools?.length));

const getDisc = await handleMcp(new Request("https://conc-exe.xyz/api/mcp", { headers: { host: "conc-exe.xyz", "x-forwarded-proto": "https" } }));
const disc = await getDisc.json();
ok("mcp GET version", disc.version === "1.1.0", disc.version);
ok("mcp GET freeTools", Array.isArray(disc.freeTools) && disc.freeTools.includes("concierge_catalog"));

// Origin must not break agent-style proxy (no Origin header) — unpaid macro should not be "Origin not allowed"
const macro = await rpc("tools/call", { name: "intel_macro", arguments: { body: {} } });
const macroText = macro.result?.content?.[0]?.text || "";
ok("mcp macro no origin error", !macroText.includes("Origin not allowed"), macro.result?._meta?.httpStatus || macro.result?._meta?.paymentRequired || "ok");

// --- Docs routes / files ---
ok("static rewrite sdk", CONCIERGE_STATIC_REWRITES["/docs/sdk/agent"] === "/docs-sdk-agent.html");
ok("file docs-sdk-agent", existsSync("frontend/public/docs-sdk-agent.html"));
const vercel = readFileSync("vercel.json", "utf8");
ok("vercel rewrite sdk", vercel.includes('"/docs/sdk/agent"') && vercel.includes("docs-sdk-agent.html"));
ok("nav sdk", readFileSync("frontend/public/js/docs-site.js", "utf8").includes('"/docs/sdk/agent"'));
ok("mcp docs 1.1", readFileSync("frontend/public/docs-integration-mcp-registry.html", "utf8").includes("v1.1.0"));
ok("llms sdk", readFileSync("frontend/public/llms.txt", "utf8").includes("/docs/sdk/agent"));
ok("registry sdk meta", JSON.parse(readFileSync("mcp-registry/server.json", "utf8")).version === "1.1.0");

const stale = [];
for (const p of [
  "frontend/public/docs-api-overview.html",
  "frontend/public/docs-agent-readiness.html",
  "frontend/public/llms.txt",
  "frontend/public/agent-skills.html",
  "frontend/public/docs.html",
]) {
  const t = readFileSync(p, "utf8");
  if (t.includes("v1.0.1")) stale.push(p);
}
ok("no stale v1.0.1 in key docs", stale.length === 0, stale.join(", ") || "clean");

console.log(fails.length ? `\nRESULT: ${fails.length} FAIL` : "\nRESULT: ALL PASS");
process.exit(fails.length ? 1 : 0);
