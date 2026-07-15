/** Registered agent identity for A2A + x402 (public keys only; secrets stay on client). */

import type { Erc8004LinkRecord } from "./erc-8004";

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
  /** Linked ERC-8004 Identity Registry mint (Base). */
  erc8004?: Erc8004LinkRecord;
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
  erc8004?: Erc8004LinkRecord & {
    explorerTx?: string;
    explorerToken?: string;
    onChain: boolean;
  };
  createdAt: string;
  cardUrl: string;
  profileUrl: string;
  registrationUrl: string;
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
  erc8004?: Erc8004LinkRecord & {
    explorerTx?: string;
    explorerToken?: string;
    registrationUrl: string;
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
    registration?: string;
    erc8004Prepare?: string;
  };
};

/** EIP-8004 agent registration file (agentURI target). */
export type Erc8004RegistrationFile = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  image: string;
  services: {
    name: string;
    endpoint: string;
    version?: string;
  }[];
  x402Support: boolean;
  active: boolean;
  registrations: { agentId: number; agentRegistry: string }[];
  supportedTrust?: string[];
  concierge?: {
    agtId: string;
    cardUrl: string;
    profileUrl: string;
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
