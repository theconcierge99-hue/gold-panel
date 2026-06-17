/** Concierge chat agent models (Gemini default + optional GLM free tier). */
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
    subtitle: "Z.ai · free tier",
    provider: "glm",
  },
} as const;

export type ConciergeAgentModelId = keyof typeof CONCIERGE_AGENT_MODELS;

export function parseConciergeAgentModel(raw: unknown): ConciergeAgentModelId {
  if (raw === "glm-4.7-flash" || raw === "glm") return "glm-4.7-flash";
  return "gemini";
}

export function listConciergeAgentModels(): (typeof CONCIERGE_AGENT_MODELS)[ConciergeAgentModelId][] {
  return Object.values(CONCIERGE_AGENT_MODELS);
}
