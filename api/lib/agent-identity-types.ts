/** Registered agent identity for A2A + x402 (public keys only; secrets stay on client). */

export type AgentIdentityRecord = {
  id: string;
  name: string;
  description?: string;
  solAddress?: string;
  evmAddress?: string;
  createdAt: string;
};

export type AgentPublicView = {
  id: string;
  name: string;
  description?: string;
  solAddress?: string;
  evmAddress?: string;
  createdAt: string;
  cardUrl: string;
  profileUrl: string;
};

export type AgentCardJson = {
  schema: "executive-lounge-agent-card-v1";
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  agentId: string;
  name: string;
  description?: string;
  registered: string;
  accounts: { chain: string; address: string }[];
  services: {
    name: string;
    endpoint: string;
    method: string;
    payment: string;
    priceUsdc: number;
  }[];
  discovery: {
    x402: string;
    openapi: string;
    docs: string;
  };
};

export type LoungeAgentServiceCard = {
  schema: "executive-lounge-agent-registry-v1";
  name: string;
  description: string;
  registerEndpoint: string;
  docsUrl: string;
  payment: string;
  networks: string[];
};
