import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { readJsonBody, runConciergeGemini, type ChatTurn, type ConciergeMode } from "./concierge-gemini";

async function handleConcierge(
  method: string | undefined,
  body: string,
  apiKey: string | undefined,
): Promise<{ status: number; json: unknown }> {
  if (method === "OPTIONS") return { status: 204, json: null };
  if (method !== "POST") return { status: 405, json: { error: "Method not allowed" } };
  if (!apiKey) {
    return {
      status: 503,
      json: {
        error: "GEMINI_API_KEY missing. Copy .env.example to .env.local and add your key.",
      },
    };
  }

  try {
    const parsed = await readJsonBody<{
      mode?: ConciergeMode;
      message?: string;
      history?: ChatTurn[];
      signal?: { title?: string; summary?: string };
    }>(body);
    const message = (parsed.message ?? "").trim();
    if (!message) return { status: 400, json: { error: "message is required" } };

    const result = await runConciergeGemini({
      apiKey,
      mode: parsed.mode === "enhance" ? "enhance" : "chat",
      message,
      history: parsed.history ?? [],
      signal: parsed.signal,
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
