import { prefixUserMessageForLanguage } from "./concierge-brain";

const DEFAULT_BASE = "https://gw.hyreagent.fun/api/inference/v1";

type ChatTurn = { role: "user" | "model"; text: string };

type OpenAIMessage = { role: "system" | "user" | "assistant"; content: string };

/** Concierge agentModel id → HYRE Gateway catalog id (GET /models). */
export const HYRE_CHAT_MODELS: Record<string, string> = {
  "hyre-deepseek-v4-flash": "deepseek-ai/DeepSeek-V4-Flash",
  "hyre-glm-4.7-flash": "zai-org/GLM-4.7-Flash",
};

export function hyreGatewayBaseUrl(): string {
  const custom = process.env.HYRE_GATEWAY_BASE_URL?.trim();
  return (custom || DEFAULT_BASE).replace(/\/$/, "");
}

export function normalizeHyreGatewayKey(raw: string | undefined): string | null {
  const key = (raw ?? "").trim();
  if (!key) return null;
  if (
    key.includes("PASTE") ||
    key.includes("your_hyre") ||
    key === "your_hyre_gateway_key_here"
  ) {
    return null;
  }
  return key;
}

export function hyreGatewayApiKeyFromEnv(): string | null {
  return normalizeHyreGatewayKey(
    process.env.HYRE_GATEWAY_KEY ?? process.env.HYRE_GATEWAY_API_KEY,
  );
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function hyreChatCompletion(options: {
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

  const res = await fetch(`${hyreGatewayBaseUrl()}/chat/completions`, {
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
    throw new Error(`HYRE ${options.model} (${res.status}): ${errText.slice(0, 160)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`HYRE ${options.model}: empty response`);
  return text;
}
