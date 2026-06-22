/**
 * Agent-to-agent mesh — handoff lines, delegate routing, and discovery templates.
 */
import type { AgentPublicView } from "./agent-identity-types";
import type { DeskVerdict } from "./concierge-defi-intel";
import { priceUsdcForResource } from "./x402-pricing";

export const A2A_HANDOFF_SCHEMA = "concierge-a2a-v1";

export type A2aDelegateStep = {
  action: "call" | "discover" | "register";
  target: "concierge" | "agent" | "mesh";
  endpoint?: string;
  cardUrl?: string;
  agentId?: string;
  priceUsdc?: number;
  reason: string;
};

export type A2aPipelineTemplate = {
  id: string;
  name: string;
  description: string;
  steps: string[];
  paidEndpoint: string;
  priceUsdc: number;
};

const BIAS_MAP: Record<DeskVerdict["signal"], string> = {
  snipe: "long",
  follow: "long",
  watch: "neutral",
  avoid: "short",
  rebalance: "neutral",
};

const CONVICTION_MAP: Record<DeskVerdict["confidence"], string> = {
  low: "L",
  medium: "M",
  high: "H",
};

export function buildA2aHandoffLine(verdict: DeskVerdict, asset = "BTC"): string {
  return [
    "A2A",
    `asset=${asset}`,
    "class=crypto",
    "tf=24h",
    `bias=${BIAS_MAP[verdict.signal]}`,
    `conviction=${CONVICTION_MAP[verdict.confidence]}`,
    `signal=${verdict.signal}`,
    "regime=mixed",
    "src=concierge",
  ].join("|");
}

export function pipelineTemplates(origin: string): A2aPipelineTemplate[] {
  const base = origin.replace(/\/$/, "");
  return [
    {
      id: "desk-brief",
      name: "Morning desk brief",
      description: "Macro + Meteora yields + verdict in one settlement",
      steps: ["intel-macro", "intel-meteora", "intel-verdict"],
      paidEndpoint: `${base}/api/concierge-intel-desk-brief`,
      priceUsdc: priceUsdcForResource("intel-desk-brief"),
    },
    {
      id: "a2a-pipeline",
      name: "A2A orchestration pipeline",
      description: "Desk brief + machine-readable handoff + delegate routing for downstream agents",
      steps: ["intel-macro", "intel-meteora", "intel-verdict", "a2a-handoff", "delegate-routing"],
      paidEndpoint: `${base}/api/concierge-intel-a2a-pipeline`,
      priceUsdc: priceUsdcForResource("intel-a2a-pipeline"),
    },
    {
      id: "scalp-follow-up",
      name: "Scalp timing follow-up",
      description: "After A2A handoff with long/short bias — 5m/15m tape",
      steps: ["intel-scalp"],
      paidEndpoint: `${base}/api/concierge-intel-scalp`,
      priceUsdc: priceUsdcForResource("intel-scalp"),
    },
  ];
}

export function suggestDelegateSteps(
  verdict: DeskVerdict,
  origin: string,
  agents: AgentPublicView[],
): A2aDelegateStep[] {
  const base = origin.replace(/\/$/, "");
  const steps: A2aDelegateStep[] = [];

  if (verdict.signal === "snipe" || verdict.signal === "follow") {
    steps.push({
      action: "call",
      target: "concierge",
      endpoint: `${base}/api/concierge-intel-scalp`,
      priceUsdc: priceUsdcForResource("intel-scalp"),
      reason: "Bias is directional — pull 5m/15m scalp tape for entry timing",
    });
  }

  if (verdict.signal === "watch" || verdict.signal === "rebalance") {
    steps.push({
      action: "call",
      target: "concierge",
      endpoint: `${base}/api/concierge-intel-wire`,
      priceUsdc: priceUsdcForResource("intel-wire"),
      reason: "Neutral desk — scan wire headlines for near-term catalysts",
    });
  }

  if (verdict.signal === "avoid") {
    steps.push({
      action: "call",
      target: "concierge",
      endpoint: `${base}/api/concierge-intel-whales`,
      priceUsdc: priceUsdcForResource("intel-whales"),
      reason: "Risk-off bias — confirm whale positioning before sizing",
    });
  }

  steps.push({
    action: "call",
    target: "concierge",
    endpoint: `${base}/api/concierge-intel-accuracy`,
    priceUsdc: 0,
    reason: "Free trust signal — verify verdict track record before routing capital",
  });

  for (const agent of agents.slice(0, 4)) {
    steps.push({
      action: "discover",
      target: "agent",
      agentId: agent.id,
      cardUrl: agent.cardUrl,
      reason: `Registered agent "${agent.name}" — coordinate via x402 using their card`,
    });
  }

  if (agents.length === 0) {
    steps.push({
      action: "register",
      target: "mesh",
      endpoint: `${base}/api/agent-identity`,
      reason: "No peer agents in directory — register agt_… so other agents can discover you",
    });
  }

  return steps;
}

export function buildA2aMeshDocument(origin: string, agents: AgentPublicView[]): Record<string, unknown> {
  const base = origin.replace(/\/$/, "");
  return {
    schema: A2A_HANDOFF_SCHEMA,
    hub: {
      name: "Concierge Agent",
      origin: base,
      role: "intelligence-seller",
      registerAgent: `${base}/api/agent-identity`,
      serviceCard: `${base}/.well-known/agent-card.json`,
      openapi: `${base}/openapi.json`,
      mcp: `${base}/api/mcp`,
    },
    pipelines: pipelineTemplates(base),
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      cardUrl: a.cardUrl,
      profileUrl: a.profileUrl,
      solAddress: a.solAddress,
      evmAddress: a.evmAddress,
    })),
    guidance:
      "Agent A pays Concierge via x402, receives intel + A2A handoff line. " +
      "Use delegate[] to call the next Concierge route or discover a registered peer agent card. " +
      "Paid orchestration: POST /api/concierge-intel-a2a-pipeline ($0.25).",
  };
}
