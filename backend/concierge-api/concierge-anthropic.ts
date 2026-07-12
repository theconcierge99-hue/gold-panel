import { prefixUserMessageForLanguage } from "./concierge-brain";

const DEFAULT_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

type ChatTurn = { role: "user" | "model"; text: string };

type AnthropicMessage = { role: "user" | "assistant"; content: string };

/** Concierge agentModel id → Anthropic Messages API model id. */
export const ANTHROPIC_CHAT_MODELS: Record<string, string> = {
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
};

export function anthropicApiBaseUrl(): string {
  const custom = process.env.ANTHROPIC_API_BASE_URL?.trim();
  return (custom || DEFAULT_BASE).replace(/\/$/, "");
}

export function normalizeAnthropicApiKey(raw: string | undefined): string | null {
  const key = (raw ?? "").trim();
  if (!key) return null;
  if (
    key.includes("PASTE") ||
    key.includes("your_anthropic") ||
    key === "your_anthropic_api_key_here"
  ) {
    return null;
  }
  return key;
}

export function anthropicApiKeyFromEnv(): string | null {
  return normalizeAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function anthropicChatCompletion(options: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: ChatTurn[];
  message: string;
  recentUserMessages?: string[];
  maxTokens: number;
  timeoutMs?: number;
}): Promise<string> {
  const messages: AnthropicMessage[] = [];
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

  const res = await fetch(`${anthropicApiBaseUrl()}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      system: options.systemPrompt,
      messages,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 24_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${options.model} (${res.status}): ${errText.slice(0, 160)}`);
  }

  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const text = data.content
    ?.filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!.trim())
    .join("\n\n")
    .trim();
  if (!text) throw new Error(`Anthropic ${options.model}: empty response`);
  return text;
}
