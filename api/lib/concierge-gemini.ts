import {
  buildConciergeSystemPrompt,
  buildImagePrompt,
  buildReplyLanguageBlock,
  detectResponseMode,
  detectTopics,
  wantsImage,
  type ConciergeResponseMode,
  type MarketTick,
} from "./concierge-brain";
import {
  fetchGeneralKnowledgeSnapshot,
  formatGeneralKnowledgeForPrompt,
} from "./general-knowledge";
import {
  fetchConciergeDeFiIntel,
  formatDeFiIntelForPrompt,
  normalizeConciergeDeFiMessage,
  wantsDeFiIntel,
  wantsDeFiYieldQuestion,
} from "./concierge-defi-intel";
import {
  formatLoungeMemoryForPrompt,
  ingestWireHeadlinesAsync,
  selectRelevantLoungeMemory,
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

function buildContents(history: ChatTurn[], message: string, maxTurns = 10): GeminiContent[] {
  const contents: GeminiContent[] = history.slice(-maxTurns).map((t) => ({
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

const GEMINI_CALL_MS = 24_000;
const GEMINI_TRADING_MS = 22_000;

const TRADING_PLAN_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const STANDARD_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

function generationConfigForMode(mode: ConciergeResponseMode): Record<string, unknown> {
  if (mode === "trading_plan") {
    return { temperature: 0.55, maxOutputTokens: 8192 };
  }
  if (mode === "trade_ideas") {
    return { temperature: 0.55, maxOutputTokens: 4096 };
  }
  return { temperature: 0.55, maxOutputTokens: 3072 };
}

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
    candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  };
  const candidate = data.candidates?.[0];
  const parsed = parseParts(candidate?.content?.parts);
  if (!parsed.text && parsed.images.length === 0) {
    throw new Error(`${model}: empty response`);
  }
  if (candidate?.finishReason === "MAX_TOKENS" && parsed.text) {
    console.warn(`[concierge-gemini] ${model} hit MAX_TOKENS (${parsed.text.length} chars)`);
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
  responseMode: ConciergeResponseMode = "standard",
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
  const tradingPlan = responseMode === "trading_plan";
  const marketTimeout = tradingPlan ? 6_500 : 7_000;
  const generalTimeout = tradingPlan ? 3_500 : 4_000;

  const queryMessage = normalizeConciergeDeFiMessage(userMessage);
  const topicsForIntel = detectTopics(queryMessage);
  const needDeFiIntel =
    wantsDeFiIntel(queryMessage) ||
    topicsForIntel.includes("defi") ||
    topicsForIntel.includes("crypto");

  const deFiQueryNote =
    /\bdllm\b/i.test(userMessage) && !/\bdlmm\b/i.test(userMessage)
      ? "USER QUERY NOTE: User typed \"DLLM\" — interpret as DLMM (Dynamic Liquidity Market Maker, e.g. Meteora on Solana), not an unknown acronym.\n\n"
      : "";

  const [snapshot, general, memoryItems] = await Promise.all([
    liveSnapshot
      ? Promise.resolve(liveSnapshot)
      : withTimeout(
          fetchConciergeMarketSnapshot({
            mode: tradingPlan ? "trading" : "standard",
            clientTicks: market,
            message: queryMessage,
          }),
          marketTimeout,
          {
            fetchedAt: new Date().toISOString(),
            ticks: market,
            derivatives: [],
            positioning: [],
            headlines: [],
            sources: [],
          },
        ),
    withTimeout(
      fetchGeneralKnowledgeSnapshot(queryMessage, { mode: "lite" }),
      generalTimeout,
      emptyGeneral,
    ),
    tradingPlan
      ? Promise.resolve([])
      : withTimeout(selectRelevantLoungeMemory(queryMessage), 3_000, []),
  ]);

  const loungeMemoryBlock = formatLoungeMemoryForPrompt(memoryItems);

  let defiIntelBlock = "";
  if (needDeFiIntel) {
    const btcTick = snapshot.ticks.find((t) => t.symbol.toUpperCase() === "BTC");
    const defiIntel = await withTimeout(
      fetchConciergeDeFiIntel({
        message: queryMessage,
        positioning: snapshot.positioning,
        sentiment: snapshot.sentiment ?? null,
        btcChange: btcTick?.change,
        insiderItems: memoryItems,
        lite: tradingPlan,
      }),
      tradingPlan ? 2_500 : 6_000,
      null,
    );
    if (defiIntel) defiIntelBlock = deFiQueryNote + formatDeFiIntelForPrompt(defiIntel);
  }

  ingestWireHeadlinesAsync(snapshot.headlines);
  const intelBlock = [
    formatLiveMarketForPrompt(snapshot),
    formatGeneralKnowledgeForPrompt(general),
    defiIntelBlock,
  ]
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
  const queryMessage = normalizeConciergeDeFiMessage(message);
  const topics = detectTopics(queryMessage);
  const deFiYieldQuestion = wantsDeFiYieldQuestion(queryMessage);
  const responseMode = detectResponseMode(queryMessage, topics, deFiYieldQuestion);
  const requireTradingPlan = responseMode === "trading_plan";
  const { intelBlock, ticks, snapshot, loungeMemoryBlock } = await resolveIntelligenceContext(
    market,
    queryMessage,
    options.liveSnapshot,
    responseMode,
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
      responseMode,
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
      generationConfig: generationConfigForMode(responseMode),
    }, { models: STANDARD_MODELS });

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
  const historyTurns = responseMode === "trading_plan" ? 4 : 8;
  const systemPrompt = buildConciergeSystemPrompt({
    topics,
    market: ticks,
    liveMarketBlock: intelBlock,
    ...promptContext,
    responseMode,
    userMessage: message,
    recentUserMessages: recentUser,
  });
  const geminiPayload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: buildContents(
      history.map((h) => ({
        role: h.role,
        text: h.role === "model" ? stripHtmlToText(h.text) : h.text,
      })),
      message,
      historyTurns,
    ),
    generationConfig: generationConfigForMode(responseMode),
  };
  let reply = "";
  const chatModels = responseMode === "trading_plan" ? TRADING_PLAN_MODELS : STANDARD_MODELS;
  const chatTimeout = responseMode === "trading_plan" ? GEMINI_TRADING_MS : GEMINI_CALL_MS;
  const errors: string[] = [];
  for (const model of chatModels) {
    try {
      const { text } = await geminiCall(apiKey, model, geminiPayload, chatTimeout);
      if (text) {
        reply = text;
        break;
      }
      errors.push(`${model}: empty`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!reply) {
    throw new Error(errors[0] || "Concierge timed out — try again in a moment");
  }

  return { reply: wrapHtmlParagraphs(reply), topics, ...meta };
}

