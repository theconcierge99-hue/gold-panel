import {
  buildConciergeSystemPrompt,
  buildImagePrompt,
  buildReplyLanguageBlock,
  detectResponseMode,
  detectTopics,
  prefixUserMessageForLanguage,
  wantsImage,
  type ConciergeResponseMode,
  type MarketTick,
} from "./concierge-brain";
import {
  fetchScalpDeskIntel,
  formatScalpIntelForPrompt,
  messageRequestsScalpDesk,
} from "./concierge-scalp-intel";
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
  formatMandatoryPriceAnchor,
  fetchBtcSpotTickFast,
  mergeMarketTicks,
  clientSnapshotIsFresh,
  type LiveMarketSnapshot,
} from "./market-data";
import { GLM_CHAT_MODEL_ID, glmApiKeyFromEnv, glmChatCompletion } from "./concierge-glm";
import {
  HYRE_CHAT_MODELS,
  hyreChatCompletion,
  hyreGatewayApiKeyFromEnv,
} from "./concierge-hyre";
import {
  CONCIERGE_AGENT_MODELS,
  type ConciergeAgentModelId,
  isAlternateConciergeChatModel,
} from "./concierge-llm-models";
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

function buildContents(
  history: ChatTurn[],
  message: string,
  maxTurns = 10,
  recentUserMessages: string[] = [],
): GeminiContent[] {
  const contents: GeminiContent[] = history.slice(-maxTurns).map((t) => ({
    role: t.role === "user" ? "user" : "model",
    parts: [{ text: t.text }],
  }));
  contents.push({
    role: "user",
    parts: [{ text: prefixUserMessageForLanguage(message, recentUserMessages) }],
  });
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

const GEMINI_CALL_MS = 18_000;
const GEMINI_TRADING_MS = 18_000;
/** Wall-clock budget for Gemini on trading-plan path (fits Vercel Edge ~30s incl. x402 + intel). */
const GEMINI_TRADING_BUDGET_MS = 20_000;
/** HYRE/GLM chat — tighter LLM cap so intel + x402 fit Vercel Edge ~30s. */
const ALT_CHAT_LLM_MS = 12_000;
/** Total handler budget from first byte (incl. x402 verify). */
export const EDGE_HANDLER_BUDGET_MS = 27_000;

function remainingHandlerMs(deadlineAt?: number): number | undefined {
  if (!deadlineAt) return undefined;
  return Math.max(0, deadlineAt - Date.now());
}

const TRADING_PLAN_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const STANDARD_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

function generationConfigForMode(mode: ConciergeResponseMode): Record<string, unknown> {
  if (mode === "trading_plan") {
    return { temperature: 0.55, maxOutputTokens: 3072 };
  }
  if (mode === "scalping_plan") {
    return { temperature: 0.5, maxOutputTokens: 3072 };
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

function normalizeConciergeReplyHtml(html: string): string {
  let out = html.trim();
  if (!out) return out;
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (full, _attrs, inner) => {
    if (/class="[^"]*conc-section/.test(full)) return full;
    let sections = inner.split(/(?=\d+\.\s*<strong>)/i);
    if (sections.length <= 1) sections = inner.split(/(?:<br\s*\/?>\s*)+(?=\d+\.\s)/i);
    if (sections.length <= 1) return full;
    return sections
      .map((part: string) => {
        const t = part.trim();
        if (!t) return "";
        const isNum = /^\d+\./.test(t.replace(/<[^>]+>/g, "").trim());
        return `<p class="${isNum ? "conc-section" : "conc-block"}">${t}</p>`;
      })
      .filter(Boolean)
      .join("");
  });
  out = out.replace(
    /(<\/strong>)\s+(<strong>([A-Za-z0-9][^<]{0,48}:)<\/strong>)/g,
    '$1<br class="conc-gap"/>$2',
  );
  return out;
}

function wrapHtmlParagraphs(reply: string): string {
  let html = reply.trim();
  if (!html.includes("<p>")) {
    html = `<p>${html.replace(/\n\n/g, "</p><p>").replace(/\n/g, " ")}</p>`;
  }
  return normalizeConciergeReplyHtml(html);
}

async function resolveIntelligenceContext(
  market: MarketTick[],
  userMessage: string,
  liveSnapshot?: LiveMarketSnapshot | null,
  responseMode: ConciergeResponseMode = "standard",
  deFiYieldQuestion = false,
  fastAltChat = false,
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
  const tradingPlan = responseMode === "trading_plan" || responseMode === "scalping_plan";
  const scalpDesk = responseMode === "scalping_plan" || messageRequestsScalpDesk(userMessage);
  const clientSnapshot = clientSnapshotIsFresh(liveSnapshot) ? liveSnapshot! : null;
  const marketTimeout = clientSnapshot
    ? 0
    : fastAltChat
      ? 3_000
      : tradingPlan
        ? 3_500
        : deFiYieldQuestion
          ? 5_000
          : 6_500;
  const generalTimeout = deFiYieldQuestion ? 2_000 : 4_000;
  const skipGeneral = tradingPlan || deFiYieldQuestion || !!clientSnapshot;

  const queryMessage = normalizeConciergeDeFiMessage(userMessage);
  const topicsForIntel = detectTopics(queryMessage);
  const liqClusterQuery = /\b(liquidation|liq cluster|cascade|perps?\s+liquidation)\b/i.test(
    queryMessage,
  );
  const needDeFiIntel = liqClusterQuery
    ? false
    : tradingPlan
      ? wantsDeFiIntel(queryMessage) || topicsForIntel.includes("defi")
      : wantsDeFiIntel(queryMessage) ||
        topicsForIntel.includes("defi") ||
        topicsForIntel.includes("crypto");

  const deFiQueryNote =
    /\bdllm\b/i.test(userMessage) && !/\bdlmm\b/i.test(userMessage)
      ? "USER QUERY NOTE: User typed \"DLLM\" — interpret as DLMM (Dynamic Liquidity Market Maker, e.g. Meteora on Solana), not an unknown acronym.\n\n"
      : "";

  const emptySnapshot: LiveMarketSnapshot = {
    fetchedAt: new Date().toISOString(),
    ticks: market,
    derivatives: [],
    positioning: [],
    headlines: [],
    sources: [],
  };
  const hasBtcInSnapshot = (clientSnapshot?.ticks ?? []).some(
    (t) => t.symbol.toUpperCase() === "BTC",
  );
  const wantsBtcAnchor =
    !fastAltChat &&
    !tradingPlan &&
    !hasBtcInSnapshot &&
    (scalpDesk ||
      topicsForIntel.includes("crypto") ||
      /\b(btc|bitcoin|eth|sol|crypto|trading plan|scalp)\b/i.test(queryMessage));

  const [snapshot, general, memoryItems, freshBtc] = await Promise.all([
    clientSnapshot
      ? Promise.resolve(clientSnapshot)
      : liveSnapshot
        ? Promise.resolve(liveSnapshot)
        : withTimeout(
            fetchConciergeMarketSnapshot({
              mode: tradingPlan ? "trading" : "standard",
              clientTicks: market,
              message: queryMessage,
            }),
            marketTimeout || 3_500,
            emptySnapshot,
          ),
    skipGeneral
      ? Promise.resolve(emptyGeneral)
      : withTimeout(
          fetchGeneralKnowledgeSnapshot(queryMessage, { mode: "lite" }),
          generalTimeout,
          emptyGeneral,
        ),
    tradingPlan || fastAltChat
      ? Promise.resolve([])
      : withTimeout(selectRelevantLoungeMemory(queryMessage), 2_500, []),
    wantsBtcAnchor ? withTimeout(fetchBtcSpotTickFast(2_000), 2_000, null) : Promise.resolve(null),
  ]);

  const loungeMemoryBlock = formatLoungeMemoryForPrompt(memoryItems);

  let enrichedSnapshot = snapshot;
  if (freshBtc) {
    enrichedSnapshot = {
      ...enrichedSnapshot,
      fetchedAt: new Date().toISOString(),
      ticks: mergeMarketTicks([freshBtc], enrichedSnapshot.ticks),
    };
  }

  const btcTick = enrichedSnapshot.ticks.find((t) => t.symbol.toUpperCase() === "BTC");
  const defiTimeout = clientSnapshot
    ? 2_000
    : fastAltChat
      ? 3_000
      : tradingPlan
        ? 2_500
        : deFiYieldQuestion
          ? 5_000
          : 5_500;
  const scalpTimeout = clientSnapshot ? 3_500 : fastAltChat ? 2_500 : tradingPlan ? 4_500 : 4_000;
  const skipDefiForTradingSnapshot = !!clientSnapshot && tradingPlan && !needDeFiIntel;
  const skipScalpForSnapshot = !!clientSnapshot && tradingPlan && !scalpDesk;

  const [defiIntel, scalp] = await Promise.all([
    needDeFiIntel && !skipDefiForTradingSnapshot
      ? withTimeout(
          fetchConciergeDeFiIntel({
            message: queryMessage,
            positioning: enrichedSnapshot.positioning,
            sentiment: enrichedSnapshot.sentiment ?? null,
            btcChange: btcTick?.change,
            insiderItems: memoryItems,
            lite: tradingPlan || deFiYieldQuestion,
          }),
          defiTimeout,
          null,
        )
      : Promise.resolve(null),
    scalpDesk && !skipScalpForSnapshot
      ? withTimeout(fetchScalpDeskIntel({ message: userMessage }), scalpTimeout, null)
      : Promise.resolve(null),
  ]);

  let defiIntelBlock = "";
  if (defiIntel) defiIntelBlock = deFiQueryNote + formatDeFiIntelForPrompt(defiIntel);

  let scalpBlock = "";
  if (scalp) scalpBlock = formatScalpIntelForPrompt(scalp);

  ingestWireHeadlinesAsync(snapshot.headlines);

  const intelBlock = [
    formatMandatoryPriceAnchor(enrichedSnapshot),
    formatLiveMarketForPrompt(enrichedSnapshot),
    scalpBlock,
    formatGeneralKnowledgeForPrompt(general),
    defiIntelBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  const ticks = enrichedSnapshot.ticks.length ? enrichedSnapshot.ticks : market;
  return { intelBlock, ticks, snapshot: enrichedSnapshot, loungeMemoryBlock };
}

type ConciergeChatResult = {
  reply: string;
  images?: string[];
  topics?: string[];
  marketLive?: MarketTick[];
  dataAsOf?: string;
  modelUsed?: string;
  modelFallback?: boolean;
};

async function tryAlternateConciergeChat(options: {
  agentModel: ConciergeAgentModelId;
  systemPrompt: string;
  history: ChatTurn[];
  message: string;
  recentUserMessages: string[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  topics: string[];
  meta: Record<string, unknown>;
}): Promise<ConciergeChatResult | null> {
  const meta = CONCIERGE_AGENT_MODELS[options.agentModel];
  if (!meta || meta.provider === "gemini") return null;

  try {
    let text = "";
    let modelUsed = "";

    if (meta.provider === "glm") {
      const glmKey = glmApiKeyFromEnv();
      if (!glmKey) {
        console.warn("[concierge-gemini] GLM_API_KEY missing, fallback Gemini");
        return null;
      }
      text = await glmChatCompletion({
        apiKey: glmKey,
        systemPrompt: options.systemPrompt,
        history: options.history,
        message: options.message,
        recentUserMessages: options.recentUserMessages,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        timeoutMs: options.timeoutMs,
      });
      modelUsed = GLM_CHAT_MODEL_ID;
    } else if (meta.provider === "hyre") {
      const hyreKey = hyreGatewayApiKeyFromEnv();
      const upstream = HYRE_CHAT_MODELS[options.agentModel];
      if (!hyreKey) {
        console.warn("[concierge-gemini] HYRE_GATEWAY_KEY missing, fallback Gemini");
        return null;
      }
      if (!upstream) {
        console.warn("[concierge-gemini] unknown HYRE model, fallback Gemini");
        return null;
      }
      text = await hyreChatCompletion({
        apiKey: hyreKey,
        model: upstream,
        systemPrompt: options.systemPrompt,
        history: options.history,
        message: options.message,
        recentUserMessages: options.recentUserMessages,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        timeoutMs: options.timeoutMs,
      });
      modelUsed = upstream;
    }

    if (!text) return null;
    return {
      reply: wrapHtmlParagraphs(text),
      topics: options.topics,
      modelUsed,
      ...options.meta,
    };
  } catch (e) {
    console.warn(
      `[concierge-gemini] ${options.agentModel} failed, fallback Gemini`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

export async function runConciergeGemini(options: {
  apiKey: string;
  mode: ConciergeMode;
  message: string;
  history?: ChatTurn[];
  signal?: { title?: string; summary?: string };
  market?: MarketTick[];
  liveSnapshot?: LiveMarketSnapshot | null;
  agentModel?: ConciergeAgentModelId;
  /** Wall-clock deadline (ms since epoch) for entire Edge handler incl. x402. */
  deadlineAt?: number;
}): Promise<ConciergeChatResult | { title: string; summary: string; implication: string }> {
  const apiKey = normalizeGeminiApiKey(options.apiKey);
  const { message, history = [], signal, market = [] } = options;
  const queryMessage = normalizeConciergeDeFiMessage(message);
  const topics = detectTopics(queryMessage);
  const deFiYieldQuestion = wantsDeFiYieldQuestion(queryMessage);
  const responseMode = detectResponseMode(queryMessage, topics, deFiYieldQuestion);
  const requireTradingPlan = responseMode === "trading_plan" || responseMode === "scalping_plan";
  const agentModel = options.agentModel ?? "gemini";
  const fastAltChat = isAlternateConciergeChatModel(agentModel) && !requireTradingPlan;
  const { intelBlock, ticks, snapshot, loungeMemoryBlock } = await resolveIntelligenceContext(
    market,
    queryMessage,
    options.liveSnapshot,
    responseMode,
    deFiYieldQuestion,
    fastAltChat,
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
        10,
        recentUser,
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
  const historyTurns = requireTradingPlan ? 4 : 8;
  const systemPrompt = buildConciergeSystemPrompt({
    topics,
    market: ticks,
    liveMarketBlock: intelBlock,
    ...promptContext,
    responseMode,
    userMessage: message,
    recentUserMessages: recentUser,
  });
  const historyForLlm = history.map((h) => ({
    role: h.role,
    text: h.role === "model" ? stripHtmlToText(h.text) : h.text,
  }));
  const genConfig = generationConfigForMode(responseMode);

  const altLlmBudget = (() => {
    const left = remainingHandlerMs(options.deadlineAt);
    if (left == null) return ALT_CHAT_LLM_MS;
    return Math.max(4_000, Math.min(ALT_CHAT_LLM_MS, left - 800));
  })();

  if (isAlternateConciergeChatModel(agentModel) && !requireTradingPlan) {
    const alt = await tryAlternateConciergeChat({
      agentModel,
      systemPrompt,
      history: historyForLlm.slice(-historyTurns),
      message,
      recentUserMessages: recentUser,
      maxTokens: Math.min(2048, Number(genConfig.maxOutputTokens ?? 3072)),
      temperature: Number(genConfig.temperature ?? 0.55),
      timeoutMs: altLlmBudget,
      topics,
      meta,
    });
    if (alt) return alt;
  }

  const geminiPayload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: buildContents(historyForLlm, message, historyTurns, recentUser),
    generationConfig: genConfig,
  };
  let reply = "";
  let modelUsed: string | undefined;
  const glmFallback = isAlternateConciergeChatModel(agentModel);
  const chatModels = requireTradingPlan ? TRADING_PLAN_MODELS : STANDARD_MODELS;
  const chatTimeout = requireTradingPlan ? GEMINI_TRADING_MS : GEMINI_CALL_MS;
  const geminiDeadline = requireTradingPlan ? Date.now() + GEMINI_TRADING_BUDGET_MS : 0;
  const errors: string[] = [];
  for (const model of chatModels) {
    const modelTimeout = requireTradingPlan
      ? Math.min(chatTimeout, Math.max(3_000, geminiDeadline - Date.now()))
      : chatTimeout;
    if (requireTradingPlan && modelTimeout < 3_000) break;
    try {
      const { text } = await geminiCall(apiKey, model, geminiPayload, modelTimeout);
      if (text) {
        reply = text;
        modelUsed = model;
        break;
      }
      errors.push(`${model}: empty`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!reply) {
    throw new Error(
      errors.find((e) => /\bGemini\b/.test(e)) ||
        errors[0] ||
        "Concierge timed out — try again shortly.",
    );
  }

  return {
    reply: wrapHtmlParagraphs(reply),
    topics,
    modelUsed: modelUsed ?? chatModels[0],
    ...(glmFallback ? { modelFallback: true } : {}),
    ...meta,
  };
}

