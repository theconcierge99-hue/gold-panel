import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { normalizeGeminiApiKey, runConciergeGemini } from "../api/lib/concierge-gemini";
import {
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "../api/lib/concierge-security";
import { fetchLiveMarketSnapshot, ticksForUi } from "../api/lib/market-data";

const jsonHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

async function handleMarket(): Promise<{ status: number; json: unknown }> {
  try {
    const snapshot = await fetchLiveMarketSnapshot();
    return {
      status: 200,
      json: {
        fetchedAt: snapshot.fetchedAt,
        ticks: ticksForUi(snapshot),
        derivatives: snapshot.derivatives,
        sources: snapshot.sources,
      },
    };
  } catch (e) {
    return { status: 500, json: { error: sanitizePublicError(e) } };
  }
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
    const { mode, message, history, signal, market } = validateConciergeRequest(raw);
    const liveSnapshot = await fetchLiveMarketSnapshot();
    const result = await runConciergeGemini({
      apiKey: apiKey!,
      mode,
      message,
      history,
      signal,
      market,
      liveSnapshot,
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
