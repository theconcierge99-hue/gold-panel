/**
 * ERC-8004 Identity Registry helpers (Base mainnet singleton).
 * @see https://eips.ethereum.org/EIPS/eip-8004
 * @see https://github.com/erc-8004/erc-8004-contracts
 */

export const ERC8004_IDENTITY_REGISTRY =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

export const ERC8004_REPUTATION_REGISTRY =
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

/** Default: Base mainnet (Concierge x402 USDC network). */
export const ERC8004_DEFAULT_CHAIN_ID = 8453 as const;

export const ERC8004_REGISTRATION_TYPE =
  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const;

export const ERC8004_IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

export type Erc8004LinkRecord = {
  chainId: number;
  registry: string;
  /** On-chain ERC-721 tokenId (decimal string). */
  agentId: string;
  /** CAIP-2 style `{namespace}:{chainId}:{registry}` */
  agentRegistry: string;
  agentURI: string;
  txHash: string;
  owner: string;
  linkedAt: string;
};

export function agentRegistryCaip(chainId: number, registry: string): string {
  return `eip155:${chainId}:${registry}`;
}

export function basescanTxUrl(txHash: string, chainId: number = ERC8004_DEFAULT_CHAIN_ID): string {
  const base = chainId === 84532 ? "https://sepolia.basescan.org" : "https://basescan.org";
  return `${base}/tx/${txHash}`;
}

export function basescanTokenUrl(
  tokenId: string,
  chainId: number = ERC8004_DEFAULT_CHAIN_ID,
  registry: string = ERC8004_IDENTITY_REGISTRY,
): string {
  const host = chainId === 84532 ? "https://sepolia.basescan.org" : "https://basescan.org";
  return `${host}/token/${registry}?a=${encodeURIComponent(tokenId)}`;
}

export function registrationFileUrl(origin: string, agtId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/agent-identity-registration?id=${encodeURIComponent(agtId)}`;
}

function baseRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL?.trim() ||
    process.env.EVM_RPC_URL?.trim() ||
    "https://mainnet.base.org"
  );
}

export async function readIdentityOnChain(input: {
  chainId?: number;
  agentId: string | number | bigint;
  registry?: string;
}): Promise<{ owner: string; tokenURI: string } | null> {
  const chainId = input.chainId ?? ERC8004_DEFAULT_CHAIN_ID;
  if (chainId !== ERC8004_DEFAULT_CHAIN_ID) {
    // Only Base mainnet wired for now (same CREATE2 address on other chains, but RPC default is Base).
    throw new Error(`Unsupported ERC-8004 chainId ${chainId} (supported: ${ERC8004_DEFAULT_CHAIN_ID})`);
  }
  const registry = (input.registry || ERC8004_IDENTITY_REGISTRY) as `0x${string}`;
  const tokenId = BigInt(String(input.agentId));

  const { createPublicClient, http } = await import("viem");
  const { base } = await import("viem/chains");
  const client = createPublicClient({
    chain: base,
    transport: http(baseRpcUrl()),
  });

  try {
    const [owner, tokenURI] = await Promise.all([
      client.readContract({
        address: registry,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      }),
      client.readContract({
        address: registry,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "tokenURI",
        args: [tokenId],
      }),
    ]);
    return { owner: String(owner).toLowerCase(), tokenURI: String(tokenURI) };
  } catch {
    return null;
  }
}

/** agentURI must point at this Concierge registration endpoint for the same agt_ id. */
export function agentUriMatches(expectedUri: string, onChainUri: string): boolean {
  const a = expectedUri.trim().replace(/\/$/, "");
  const b = onChainUri.trim().replace(/\/$/, "");
  if (a === b) return true;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.pathname === ub.pathname &&
      ua.searchParams.get("id") === ub.searchParams.get("id") &&
      ua.searchParams.get("id")?.startsWith("agt_") === true
    );
  } catch {
    return false;
  }
}
