/** Concierge chat agent models (Gemini default + optional GLM / HYRE / Anthropic). */
export const CONCIERGE_AGENT_MODELS = {
  gemini: {
    id: "gemini",
    label: "Gemini Flash",
    subtitle: "Default · Google AI",
    provider: "gemini",
  },
  "glm-4.7-flash": {
    id: "glm-4.7-flash",
    label: "GLM-4.7 Flash",
    subtitle: "Z.ai",
    provider: "glm",
  },
  "hyre-deepseek-v4-flash": {
    id: "hyre-deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    subtitle: "HYRE Gateway",
    provider: "hyre",
  },
  "hyre-glm-4.7-flash": {
    id: "hyre-glm-4.7-flash",
    label: "GLM 4.7 Flash",
    subtitle: "HYRE Gateway",
    provider: "hyre",
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet",
    subtitle: "Anthropic",
    provider: "anthropic",
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    label: "Claude Haiku",
    subtitle: "Anthropic · Fast",
    provider: "anthropic",
  },
} as const;

export type ConciergeAgentModelId = keyof typeof CONCIERGE_AGENT_MODELS;

const AGENT_MODEL_ALIASES: Record<string, ConciergeAgentModelId> = {
  glm: "glm-4.7-flash",
  "hyre-deepseek": "hyre-deepseek-v4-flash",
  "deepseek-v4-flash": "hyre-deepseek-v4-flash",
  "hyre-glm": "hyre-glm-4.7-flash",
  claude: "claude-sonnet-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

export function parseConciergeAgentModel(raw: unknown): ConciergeAgentModelId {
  if (typeof raw !== "string") return "gemini";
  const key = raw.trim();
  if (key in CONCIERGE_AGENT_MODELS) return key as ConciergeAgentModelId;
  if (key in AGENT_MODEL_ALIASES) return AGENT_MODEL_ALIASES[key];
  return "gemini";
}

export function isAlternateConciergeChatModel(id: ConciergeAgentModelId): boolean {
  return id !== "gemini";
}

export function listConciergeAgentModels(): (typeof CONCIERGE_AGENT_MODELS)[ConciergeAgentModelId][] {
  return Object.values(CONCIERGE_AGENT_MODELS);
}
