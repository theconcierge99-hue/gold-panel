import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { normalizeGeminiApiKey, runConciergeGemini } from "../api/lib/concierge-gemini";
import {
  readBodyWithLimit,
  sanitizePublicError,
  validateConciergeRequest,
} from "../api/lib/concierge-security";

async function handleConcierge(
  method: string | undefined,
  request: Request,
  apiKey: string | undefined,
): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };

  if (method === "OPTIONS") return { status: 204, json: null, headers };
  if (method !== "POST") {
    return { status: 405, json: { error: "Method not allowed" }, headers };
  }

  try {
    normalizeGeminiApiKey(apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GEMINI_API_KEY missing";
    return { status: 503, json: { error: msg }, headers };
  }

  try {
    const raw = await readBodyWithLimit(request);
    const { mode, message, history, signal, market } = validateConciergeRequest(raw);
    const result = await runConciergeGemini({
      apiKey: apiKey!,
      mode,
      message,
      history,
      signal,
      market,
    });
    return { status: 200, json: result, headers };
  } catch (e) {
    const msg = sanitizePublicError(e);
    return { status: 500, json: { error: msg }, headers };
  }
}

export function conciergeDevPlugin(): Plugin {
  return {
    name: "concierge-api-dev",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
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

          const { status, json, headers } = await handleConcierge(
            req.method,
            fakeRequest,
            env.GEMINI_API_KEY,
          );

          for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
          if (status === 204) {
            res.statusCode = 204;
            res.end();
            return;
          }
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(json));
        });
      });
    },
  };
}
