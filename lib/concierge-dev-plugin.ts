import type { Plugin } from "vite";
import { loadEnv } from "vite";
import {
  normalizeGeminiApiKey,
  parseConciergeBody,
  runConciergeGemini,
  type ConciergeMode,
} from "../api/lib/concierge-gemini";

async function handleConcierge(
  method: string | undefined,
  rawBody: string,
  apiKey: string | undefined,
): Promise<{ status: number; json: unknown }> {
  if (method === "OPTIONS") return { status: 204, json: null };
  if (method !== "POST") return { status: 405, json: { error: "Method not allowed" } };
  try {
    normalizeGeminiApiKey(apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GEMINI_API_KEY missing";
    return { status: 503, json: { error: msg } };
  }

  try {
    let parsed: ReturnType<typeof parseConciergeBody>;
    try {
      parsed = parseConciergeBody(rawBody ? JSON.parse(rawBody) : {});
    } catch {
      return { status: 400, json: { error: "Invalid JSON body" } };
    }

    const message = (parsed.message ?? "").trim();
    if (!message) return { status: 400, json: { error: "message is required" } };

    const mode: ConciergeMode =
      parsed.mode === "enhance" ? "enhance" : parsed.mode === "image" ? "image" : "chat";
    const result = await runConciergeGemini({
      apiKey: apiKey!,
      mode,
      message,
      history: parsed.history ?? [],
      signal: parsed.signal,
      market: parsed.market ?? [],
    });
    return { status: 200, json: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { status: 500, json: { error: msg } };
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
          const body = Buffer.concat(chunks).toString("utf8");
          const { status, json } = await handleConcierge(
            req.method,
            body,
            env.GEMINI_API_KEY,
          );

          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");

          if (status === 204) {
            res.statusCode = 204;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.statusCode = status;
          res.end(JSON.stringify(json));
        });
      });
    },
  };
}
