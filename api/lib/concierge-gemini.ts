import {
  buildConciergeSystemPrompt,
  buildImagePrompt,
  buildReplyLanguageBlock,
  detectTopics,
  wantsImage,
  wantsTradingPlan,
  type MarketTick,
} from "./concierge-brain";
import {
  fetchGeneralKnowledgeSnapshot,
  formatGeneralKnowledgeForPrompt,
} from "./general-knowledge";
import {
  buildLoungeMemoryContextBlock,
  ingestWireHeadlinesAsync,
} from "./lounge-memory";
import {
  fetchConciergeMarketSnapshot,
  formatLiveMarketForPrompt,
  type LiveMarketSnapshot,
} from "./market-data";
import { withTimeout } from "./with-timeout";

export type ChatTurn = { role: "user" | "model"; text: string };

export type ConciergeMode = "chat" | "enhance" | "image";

const ENHANCE_PROMPT = `Rewrite the signal copy for Executive Lounge. Return JSON only: {"title":"...","summary":"...","implication":"..."}.
Keep institutional tone. Title under 120 chars. Summary 2–3 sentences. Implication 2 sentences on market impact.
Use the same language as the draft (see REPLY LANGUAGE below).`;

const TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-2.0-flash-preview-image-generation",
];

type GeminiContent = { role: string; parts: { text: string }[] };

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } };

export function normalizeGeminiApiKey(raw: string | undefined): string {
  const key = (raw ?? "").trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is missing. Add it in .env.local (local) or Vercel Environment Variables (production).",
    );
  }
  if (
    key.includes("PASTE") ||
    key.includes("your_gemini") ||
    key === "your_gemini_api_key_here"
  ) {
    throw new Error(
      "GEMINI_API_KEY is still a placeholder. Paste a real key from https://aistudio.google.com/apikey",
    );
  }
  if (!key.startsWith("AIza")) {
    throw new Error("GEMINI_API_KEY must start with AIza (Google AI Studio key).");
  }
  return key;
}

function buildContents(history: ChatTurn[], message: string): GeminiContent[] {
  const contents: GeminiContent[] = history.slice(-10).map((t) => ({
    role: t.role === "user" ? "user" : "model",
    parts: [{ text: t.text }],
  }));
  contents.push({ role: "user", parts: [{ text: message }] });
  return contents;
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGeminiError(status: number, errText: string, model: string): string | null {
  if (errText.includes("API_KEY_INVALID") || errText.includes("API key not valid")) {
    return "Invalid GEMINI_API_KEY. Create a new key at https://aistudio.google.com/apikey";
  }
  if (status === 404 || errText.includes("not found")) {
    return null;
  }
  return `Gemini ${model} (${status}): ${errText.slice(0, 160)}`;
}

function parseParts(parts: GeminiPart[] | undefined): { text: string; images: string[] } {
  let text = "";
  const images: string[] = [];
  for (const p of parts ?? []) {
    if (p.text) text += p.text;
    if (p.inlineData?.data) {
      const mime = p.inlineData.mimeType || "image/png";
      images.push(`data:${mime};base64,${p.inlineData.data}`);
    }
  }
  return { text: text.trim(), images };
}

const GEMINI_CALL_MS = 12_000;

async function geminiCall(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>,
  timeoutMs = GEMINI_CALL_MS,
): Promise<{ text: string; images: string[] }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    const fatal = parseGeminiError(res.status, errText, model);
    if (fatal) throw new Error(fatal);
    throw new Error(`Gemini request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] } }[];
  };
  const parsed = parseParts(data.candidates?.[0]?.content?.parts);
  if (!parsed.text && parsed.images.length === 0) {
    throw new Error(`${model}: empty response`);
  }
  return parsed;
}

async function geminiGenerateText(
  apiKey: string,
  payload: Record<string, unknown>,
  options?: { models?: string[] },
): Promise<string> {
  const errors: string[] = [];
  for (const model of options?.models ?? TEXT_MODELS) {
    try {
      const { text } = await geminiCall(apiKey, model, payload);
      if (text) return text;
      errors.push(`${model}: empty`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(
    errors.length ? "No Gemini text model available" : "Gemini request failed",
  );
}

async function geminiGenerateImage(
  apiKey: string,
  prompt: string,
): Promise<{ images: string[]; caption: string }> {
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };
  const errors: string[] = [];
  for (const model of IMAGE_MODELS) {
    try {
      const result = await geminiCall(apiKey, model, payload);
      if (result.images.length) {
        return { images: result.images, caption: result.text || "Generated visual" };
      }
      errors.push(`${model}: no image in response`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error("Image generation unavailable for this API key");
}

function wrapHtmlParagraphs(reply: string): string {
  if (reply.includes("<p>")) return reply;
  return `<p>${reply.replace(/\n\n/g, "</p><p>").replace(/\n/g, " ")}</p>`;
}

async function resolveIntelligenceContext(
  market: MarketTick[],
  userMessage: string,
  liveSnapshot?: LiveMarketSnapshot | null,
): Promise<{
  intelBlock: string;
  ticks: MarketTick[];
  snapshot: LiveMarketSnapshot;
  loungeMemoryBlock: string;
}> {
  const emptyGeneral = {
    fetchedAt: new Date().toISOString(),
    wikipedia: [],
    worldNews: [],
    sources: [] as string[],
  };
  const topics = detectTopics(userMessage);
  const tradingPlan = wantsTradingPlan(userMessage, topics);
  const knowledgeMode = tradingPlan ? ("trading" as const) : undefined;

  const [snapshot, general, loungeMemoryBlock] = await Promise.all([
    liveSnapshot
      ? Promise.resolve(liveSnapshot)
      : withTimeout(fetchConciergeMarketSnapshot(), 8_000, {
          fetchedAt: new Date().toISOString(),
          ticks: market,
          derivatives: [],
          positioning: [],
          headlines: [],
          sources: [],
        }),
    withTimeout(
      fetchGeneralKnowledgeSnapshot(
        userMessage,
        knowledgeMode ? { mode: knowledgeMode } : { lite: true },
      ),
      5_000,
      emptyGeneral,
    ),
    withTimeout(buildLoungeMemoryContextBlock(userMessage), 4_000, ""),
  ]);
  ingestWireHeadlinesAsync(snapshot.headlines);
  const intelBlock = [formatLiveMarketForPrompt(snapshot), formatGeneralKnowledgeForPrompt(general)]
    .filter(Boolean)
    .join("\n\n");
  const ticks = snapshot.ticks.length ? snapshot.ticks : market;
  return { intelBlock, ticks, snapshot, loungeMemoryBlock };
}

export async function runConciergeGemini(options: {
  apiKey: string;
  mode: ConciergeMode;
  message: string;
  history?: ChatTurn[];
  signal?: { title?: string; summary?: string };
  market?: MarketTick[];
  liveSnapshot?: LiveMarketSnapshot | null;
}): Promise<
  | {
      reply: string;
      images?: string[];
      topics?: string[];
      marketLive?: MarketTick[];
      dataAsOf?: string;
    }
  | { title: string; summary: string; implication: string }
> {
  const apiKey = normalizeGeminiApiKey(options.apiKey);
  const { message, history = [], signal, market = [] } = options;
  const topics = detectTopics(message);
  const requireTradingPlan = wantsTradingPlan(message, topics);
  const { intelBlock, ticks, snapshot, loungeMemoryBlock } = await resolveIntelligenceContext(
    market,
    message,
    options.liveSnapshot,
  );
  const promptContext = { loungeMemoryBlock };
  const meta = { marketLive: ticks, dataAsOf: snapshot.fetchedAt };
  const mode =
    options.mode === "image" || (options.mode === "chat" && wantsImage(message))
      ? "image"
      : options.mode === "enhance"
        ? "enhance"
        : "chat";

  if (mode === "enhance") {
    const userText = [
      "Enhance this signal draft.",
      signal?.title ? `Title: ${signal.title}` : "",
      signal?.summary ? `Summary: ${signal.summary}` : "",
      message ? `Editor note: ${message}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const draftParts = [signal?.title, signal?.summary, message].filter(Boolean) as string[];
    const raw = await geminiGenerateText(apiKey, {
      systemInstruction: {
        parts: [
          {
            text: `${ENHANCE_PROMPT}\n\n${buildReplyLanguageBlock(
              draftParts[draftParts.length - 1] ?? "",
              draftParts,
            )}`,
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 800 },
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Enhance: invalid model response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      summary?: string;
      implication?: string;
    };
    return {
      title: parsed.title ?? signal?.title ?? "",
      summary: parsed.summary ?? signal?.summary ?? "",
      implication: parsed.implication ?? "",
    };
  }

  if (mode === "image") {
    const recentUser = history.filter((h) => h.role === "user").map((h) => h.text);
    const systemPrompt = buildConciergeSystemPrompt({
      topics,
      market: ticks,
      liveMarketBlock: intelBlock,
      ...promptContext,
      imageMode: true,
      requireTradingPlan,
      userMessage: message,
      recentUserMessages: recentUser,
    });
    const analysis = await geminiGenerateText(apiKey, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: buildContents(
        history.map((h) => ({
          role: h.role,
          text: h.role === "model" ? stripHtmlToText(h.text) : h.text,
        })),
        message,
      ),
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: requireTradingPlan ? 2048 : 1200,
      },
    });

    let images: string[] = [];
    try {
      const img = await geminiGenerateImage(apiKey, buildImagePrompt(message, topics));
      images = img.images;
    } catch {
      /* image optional — analysis still returned */
    }

    return {
      reply: wrapHtmlParagraphs(analysis),
      images,
      topics,
      ...meta,
    };
  }

  const recentUser = history.filter((h) => h.role === "user").map((h) => h.text);
  const systemPrompt = buildConciergeSystemPrompt({
    topics,
    market: ticks,
    liveMarketBlock: intelBlock,
    ...promptContext,
    requireTradingPlan,
    userMessage: message,
    recentUserMessages: recentUser,
  });
  let reply = await geminiGenerateText(
    apiKey,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: buildContents(
        history.map((h) => ({
          role: h.role,
          text: h.role === "model" ? stripHtmlToText(h.text) : h.text,
        })),
        message,
      ),
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: requireTradingPlan ? 2048 : 1024,
      },
    },
    { models: requireTradingPlan ? TEXT_MODELS.slice(0, 2) : TEXT_MODELS.slice(0, 2) },
  );

  return { reply: wrapHtmlParagraphs(reply), topics, ...meta };
}

