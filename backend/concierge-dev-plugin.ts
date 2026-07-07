import type { Plugin } from "vite";
import { loadEnv } from "vite";
import fs from "node:fs";
import path from "node:path";
import {
  resolveStaticRewrite,
  shouldSkipStaticRewrite,
} from "./concierge-static-routes";
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
    const { mode, message, history, signal, market, liveSnapshot, agentModel } =
      validateConciergeRequest(raw);
    const result = await runConciergeGemini({
      apiKey: apiKey!,
      mode,
      message,
      history,
      signal,
      market,
      liveSnapshot,
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
    enforce: "pre",
    configureServer(server) {
      // Clean URLs → static HTML (same as vercel.json rewrites)
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? "/";
        const q = raw.indexOf("?");
        const pathname = q === -1 ? raw : raw.slice(0, q);
        const search = q === -1 ? "" : raw.slice(q);

        if (shouldSkipStaticRewrite(pathname)) return next();

        const html = resolveStaticRewrite(pathname);
        if (html) {
          req.url = html + search;
          return next();
        }

        if (!pathname.includes(".")) {
          const filePath = path.join(server.config.root, "public", "404.html");
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          if (fs.existsSync(filePath)) {
            res.end(fs.readFileSync(filePath, "utf8"));
            return;
          }
          res.end("<!doctype html><title>404</title><h1>Not found</h1>");
          return;
        }

        return next();
      });

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
            const fwdHeaders = new Headers({
              "content-type": req.headers["content-type"] ?? "application/json",
              "content-length": String(Buffer.byteLength(bodyText)),
              origin: req.headers.origin ?? "http://localhost:8080",
            });
            for (const name of [
              "payment-signature",
              "payment-required",
              "x-agent-id",
              "x-oobe-settlement-tx",
              "x-payment-settlement",
              "x-payment-settlement-tx",
              "x-payment-amount",
              "x-payment-sig",
              "x-payment-escrow",
              "x-soon-holder-wallet",
            ]) {
              const v = req.headers[name];
              if (typeof v === "string" && v) fwdHeaders.set(name, v);
            }
            const fakeRequest = new Request(fullUrl, {
              method: req.method,
              headers: fwdHeaders,
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
