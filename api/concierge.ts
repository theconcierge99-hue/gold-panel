import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  parseConciergeBody,
  runConciergeGemini,
  type ConciergeMode,
} from "./lib/concierge-gemini";

export const config = {
  maxDuration: 10,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error:
        "GEMINI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.",
    });
  }

  try {
    const body = parseConciergeBody(req.body);
    const message = (body.message ?? "").trim();
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const mode: ConciergeMode = body.mode === "enhance" ? "enhance" : "chat";
    const result = await runConciergeGemini({
      apiKey,
      mode,
      message,
      history: body.history ?? [],
      signal: body.signal,
    });

    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/concierge]", msg);
    return res.status(500).json({ error: msg });
  }
}
