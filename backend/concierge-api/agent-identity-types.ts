/** Registered agent identity for A2A + x402 (public keys only; secrets stay on client). */

export type AgentIdentityRecord = {
  id: string;
  name: string;
  description?: string;
  solAddress?: string;
  evmAddress?: string;
  /** OOBE Synapse SAP agent wallet (usually same as solAddress) */
  sapWallet?: string;
  /** On-chain SAP agent PDA */
  sapAgentPda?: string;
  createdAt: string;
};

export type AgentPublicView = {
  id: string;
  name: string;
  description?: string;
  solAddress?: string;
  evmAddress?: string;
  sapWallet?: string;
  sapAgentPda?: string;
  sapVerified?: boolean;
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
  sap?: {
    wallet?: string;
    agentPda?: string;
    explorerUrl?: string;
  };
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
    mcp?: string;
    intelAccuracy?: string;
    a2aMesh?: string;
    paysh?: string;
    payshGuide?: string;
    grokBuild?: string;
    grokBuildGuide?: string;
    oobe?: string;
    sapToolsManifest?: string;
  };
};

export type LoungeAgentServiceCard = {
  schema: "concierge-agent-registry-v1";
  name: string;
  description: string;
  registerEndpoint: string;
  docsUrl: string;
  payment: string;
  protocols: string[];
  networks: string[];
  discovery: {
    x402: string;
    openapi: string;
    mcp: string;
    intelAccuracy: string;
    apiCatalog: string;
    a2aMesh: string;
    caseStudy: string;
    oobe?: string;
    sapToolsManifest?: string;
  };
  trust: {
    intelAccuracyEndpoint: string;
    description: string;
  };
};
