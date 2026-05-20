import {
  parseConciergeBody,
  runConciergeGemini,
  type ConciergeMode,
} from "./lib/concierge-gemini";

export const config = {
  runtime: "edge",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseConciergeBody(await request.json());
    const message = (body.message ?? "").trim();
    if (!message) {
      return jsonResponse({ error: "message is required" }, 400);
    }

    const mode: ConciergeMode =
      body.mode === "enhance" ? "enhance" : body.mode === "image" ? "image" : "chat";
    const result = await runConciergeGemini({
      apiKey: process.env.GEMINI_API_KEY,
      mode,
      message,
      history: body.history ?? [],
      signal: body.signal,
      market: body.market ?? [],
    });

    return jsonResponse(result, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/concierge]", msg);
    return jsonResponse({ error: msg }, 500);
  }
}
