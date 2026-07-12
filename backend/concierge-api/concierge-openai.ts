import { prefixUserMessageForLanguage } from "./concierge-brain";

const DEFAULT_BASE = "https://api.openai.com/v1";

type ChatTurn = { role: "user" | "model"; text: string };

type OpenAIMessage = { role: "system" | "user" | "assistant"; content: string };

/** Concierge agentModel id → OpenAI Chat Completions model id. */
export const OPENAI_CHAT_MODELS: Record<string, string> = {
  "gpt-5.6-terra": "gpt-5.6-terra",
  "gpt-5.6-luna": "gpt-5.6-luna",
};

export function openaiApiBaseUrl(): string {
  const custom = process.env.OPENAI_API_BASE_URL?.trim();
  return (custom || DEFAULT_BASE).replace(/\/$/, "");
}

export function normalizeOpenaiApiKey(raw: string | undefined): string | null {
  const key = (raw ?? "").trim();
  if (!key) return null;
  if (
    key.includes("PASTE") ||
    key.includes("your_openai") ||
    key === "your_openai_api_key_here"
  ) {
    return null;
  }
  return key;
}

export function openaiApiKeyFromEnv(): string | null {
  return normalizeOpenaiApiKey(process.env.OPENAI_API_KEY);
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function openaiChatCompletion(options: {
  apiKey: string;
  model: string;
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

  const res = await fetch(`${openaiApiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 24_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${options.model} (${res.status}): ${errText.slice(0, 160)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`OpenAI ${options.model}: empty response`);
  return text;
}
