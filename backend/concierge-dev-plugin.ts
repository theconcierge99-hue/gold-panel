import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { normalizeGeminiApiKey, runConciergeGemini } from "./concierge-api/concierge-gemini";
import {
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "./concierge-api/concierge-security";
import { buildLoungeMarketPayload } from "./concierge-api/lounge-market";
import { handleSignalOpen } from "./concierge-api/signal-open-handler";
import { handleSignalPublish } from "./concierge-api/signal-publish-handler";
import handleAgentIdentity from "./concierge-api/routes/agent-identity";
import handleAgentIdentityCard from "./concierge-api/routes/agent-identity-card";
import handleWellKnownAgentCard from "./concierge-api/routes/well-known-agent-card";
import { handleConciergeIntelRoute } from "./concierge-api/concierge-intel-handler";
import { dispatchApiRoute } from "./concierge-api/api-router";

const jsonHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

async function handleMarket(): Promise<{ status: number; json: unknown }> {
  try {
    return { status: 200, json: await buildLoungeMarketPayload() };
  } catch (e) {
    return { status: 500, json: { error: sanitizePublicError(e) } };
  }
}

async function forwardApi(
  handler: (req: Request) => Promise<Response>,
  method: string | undefined,
  bodyText: string,
  pathname: string,
): Promise<{ status: number; json: unknown; noBody?: boolean }> {
  const fakeRequest = new Request(`http://localhost${pathname}`, {
    method: method || "GET",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bodyText)),
      origin: "http://localhost:5173",
    },
    body: bodyText || undefined,
  });
  const res = await handler(fakeRequest);
  if (res.status === 204) return { status: 204, json: null, noBody: true };
  const text = await res.text();
  let json: unknown = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function handleConcierge(
  method: string | undefined,
  request: Request,
  apiKey: string | undefined,
): Promise<{ status: number; json: unknown }> {
  if (method === "OPTIONS") return { status: 204, json: null };
  if (method !== "POST") {
    return { status: 405, json: { error: "Method not allowed" } };
  }

  try {
    normalizeGeminiApiKey(apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GEMINI_API_KEY missing";
    return { status: 503, json: { error: msg } };
  }

  try {
    const raw = await readBodyWithLimit(request);
    const { mode, message, history, signal, market, agentModel } = validateConciergeRequest(raw);
    const result = await runConciergeGemini({
      apiKey: apiKey!,
      mode,
      message,
      history,
      signal,
      market,
      agentModel,
    });
    return { status: 200, json: result };
  } catch (e) {
    return { status: 500, json: { error: sanitizePublicError(e) } };
  }
}

export function conciergeDevPlugin(): Plugin {
  return {
    name: "concierge-api-dev",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];

        if (url === "/api/market" && req.method === "GET") {
          const { status, json } = await handleMarket();
          res.statusCode = status;
          for (const [k, v] of Object.entries(jsonHeaders)) res.setHeader(k, v);
          res.end(JSON.stringify(json));
          return;
        }

        const signalRoutes: Record<string, (r: Request) => Promise<Response>> = {
          "/api/lounge-signal-publish": handleSignalPublish,
          "/api/lounge-signal-open": handleSignalOpen,
          "/api/signal-publish": handleSignalPublish,
          "/api/signal-open": handleSignalOpen,
          "/api/agent-identity": handleAgentIdentity,
          "/api/agent-identity-card": handleAgentIdentityCard,
          "/api/concierge-intel-tvl": (r) => handleConciergeIntelRoute(r, "intel-tvl"),
          "/api/concierge-intel-yields": (r) => handleConciergeIntelRoute(r, "intel-yields"),
          "/api/concierge-intel-whales": (r) => handleConciergeIntelRoute(r, "intel-whales"),
          "/api/concierge-intel-wallet": (r) => handleConciergeIntelRoute(r, "intel-wallet"),
          "/api/concierge-intel-verdict": (r) => handleConciergeIntelRoute(r, "intel-verdict"),
          "/api/concierge-intel-airdrop": (r) => handleConciergeIntelRoute(r, "intel-airdrop"),
          "/api/concierge-intel-listing": (r) => handleConciergeIntelRoute(r, "intel-listing"),
          "/api/concierge-intel-momentum": (r) => handleConciergeIntelRoute(r, "intel-momentum"),
          "/api/concierge-intel-scalp": (r) => handleConciergeIntelRoute(r, "intel-scalp"),
          "/api/concierge-intel-macro": (r) => handleConciergeIntelRoute(r, "intel-macro"),
          "/api/concierge-intel-wire": (r) => handleConciergeIntelRoute(r, "intel-wire"),
          "/api/concierge-intel-meteora": (r) => handleConciergeIntelRoute(r, "intel-meteora"),
          "/api/concierge-intel-desk-brief": (r) => handleConciergeIntelRoute(r, "intel-desk-brief"),
        };
        if (url && signalRoutes[url]) {
          const chunks: Buffer[] = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", async () => {
            const bodyText = Buffer.concat(chunks).toString("utf8");
            const { status, json, noBody } = await forwardApi(
              signalRoutes[url],
              req.method,
              bodyText,
              url,
            );
            for (const [k, v] of Object.entries(jsonHeaders)) res.setHeader(k, v);
            if (noBody) {
              res.statusCode = 204;
              res.end();
              return;
            }
            res.statusCode = status;
            res.end(JSON.stringify(json));
          });
          return;
        }

        if (url === "/.well-known/agent-card.json" && req.method === "GET") {
          const res2 = await handleWellKnownAgentCard(
            new Request("http://localhost/.well-known/agent-card.json", { method: "GET" }),
          );
          for (const [k, v] of Object.entries(jsonHeaders)) res.setHeader(k, v);
          res.statusCode = res2.status;
          res.end(await res2.text());
          return;
        }

        if (url?.startsWith("/api/") && url !== "/api/market" && url !== "/api/concierge" && !signalRoutes[url]) {
          const chunks: Buffer[] = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", async () => {
            const bodyText = Buffer.concat(chunks).toString("utf8");
            const fullUrl = `http://localhost${req.url ?? url}`;
            const fakeRequest = new Request(fullUrl, {
              method: req.method,
              headers: {
                "content-type": req.headers["content-type"] ?? "application/json",
                "content-length": String(Buffer.byteLength(bodyText)),
                origin: req.headers.origin ?? "http://localhost:8080",
              },
              body: bodyText || undefined,
            });
            const res2 = await dispatchApiRoute(fakeRequest);
            for (const [k, v] of res2.headers.entries()) {
              if (k.toLowerCase() === "transfer-encoding") continue;
              res.setHeader(k, v);
            }
            res.statusCode = res2.status;
            res.end(Buffer.from(await res2.arrayBuffer()));
          });
          return;
        }

        if (url !== "/api/concierge") return next();

        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          const fakeRequest = new Request("http://localhost/api/concierge", {
            method: req.method,
            headers: {
              "content-type": req.headers["content-type"] ?? "application/json",
              "content-length": String(Buffer.byteLength(bodyText)),
            },
            body: bodyText,
          });

          const { status, json } = await handleConcierge(
            req.method,
            fakeRequest,
            env.GEMINI_API_KEY,
          );

          for (const [k, v] of Object.entries(jsonHeaders)) res.setHeader(k, v);
          if (status === 204) {
            res.statusCode = 204;
            res.end();
            return;
          }
          res.statusCode = status;
          res.end(JSON.stringify(json));
        });
      });
    },
  };
}
