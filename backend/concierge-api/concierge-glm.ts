import { prefixUserMessageForLanguage } from "./concierge-brain";

const GLM_MODEL = "glm-4.7-flash";
const DEFAULT_BASE = "https://api.z.ai/api/paas/v4";

type ChatTurn = { role: "user" | "model"; text: string };

type OpenAIMessage = { role: "system" | "user" | "assistant"; content: string };

export function glmApiBaseUrl(): string {
  const custom = process.env.GLM_API_BASE_URL?.trim();
  return (custom || DEFAULT_BASE).replace(/\/$/, "");
}

export function normalizeGlmApiKey(raw: string | undefined): string | null {
  const key = (raw ?? "").trim();
  if (!key) return null;
  if (key.includes("PASTE") || key.includes("your_glm") || key === "your_glm_api_key_here") {
    return null;
  }
  return key;
}

export function glmApiKeyFromEnv(): string | null {
  return normalizeGlmApiKey(process.env.GLM_API_KEY ?? process.env.ZAI_API_KEY);
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function glmChatCompletion(options: {
  apiKey: string;
  systemPrompt: string;
  history: ChatTurn[];
  message: string;
  recentUserMessages?: string[];
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
}): Promise<string> {
  const messages: OpenAIMessage[] = [{ role: "system", content: options.systemPrompt }];
  for (const turn of options.history) {
    messages.push({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.role === "model" ? stripHtmlToText(turn.text) : turn.text,
    });
  }
  messages.push({
    role: "user",
    content: prefixUserMessageForLanguage(
      options.message,
      options.recentUserMessages ?? [],
    ),
  });

  const res = await fetch(`${glmApiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: GLM_MODEL,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 24_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GLM ${GLM_MODEL} (${res.status}): ${errText.slice(0, 160)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${GLM_MODEL}: empty response`);
  return text;
}

export const GLM_CHAT_MODEL_ID = GLM_MODEL;
