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
  const host = chainId === 84532 ? "https://sepolia.basescan.org" : "https://basescan.org";
  return `${host}/tx/${txHash}`;
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

function baseRpcCandidates(): string[] {
  const preferred = [
    process.env.BASE_RPC_URL?.trim(),
    process.env.EVM_RPC_URL?.trim(),
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://1rpc.io/base",
  ].filter((u): u is string => !!u);
  return [...new Set(preferred)];
}

export async function readIdentityOnChain(input: {
  chainId?: number;
  agentId: string | number | bigint;
  registry?: string;
}): Promise<{ owner: string; tokenURI: string }> {
  const chainId = input.chainId ?? ERC8004_DEFAULT_CHAIN_ID;
  if (chainId !== ERC8004_DEFAULT_CHAIN_ID) {
    throw new Error(`Unsupported ERC-8004 chainId ${chainId} (supported: ${ERC8004_DEFAULT_CHAIN_ID})`);
  }
  const registry = (input.registry || ERC8004_IDENTITY_REGISTRY) as `0x${string}`;
  const tokenId = BigInt(String(input.agentId));

  const { createPublicClient, http } = await import("viem");
  const { base } = await import("viem/chains");
  const errors: string[] = [];

  for (const rpc of baseRpcCandidates()) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpc, { timeout: 12_000 }),
      });
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
    } catch (e) {
      errors.push(`${rpc}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Base RPC failed after ${errors.length} endpoint(s): ${errors.slice(0, 2).join(" | ")}`);
}

/** Verify mint via tx receipt Registered event (fallback when eth_call is flaky). */
export async function readIdentityFromTx(input: {
  txHash: `0x${string}` | string;
  registry?: string;
}): Promise<{ owner: string; tokenURI: string; agentId: string } | null> {
  const registry = (input.registry || ERC8004_IDENTITY_REGISTRY).toLowerCase();
  const hash = input.txHash as `0x${string}`;
  const { createPublicClient, http, parseEventLogs } = await import("viem");
  const { base } = await import("viem/chains");
  const errors: string[] = [];

  for (const rpc of baseRpcCandidates()) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpc, { timeout: 12_000 }),
      });
      const receipt = await client.getTransactionReceipt({ hash });
      if (!receipt || receipt.status !== "success") return null;
      const logs = parseEventLogs({
        abi: ERC8004_IDENTITY_ABI,
        eventName: "Registered",
        logs: receipt.logs.filter((l) => l.address.toLowerCase() === registry),
      });
      const ev = logs[0];
      if (!ev) return null;
      return {
        agentId: String(ev.args.agentId),
        tokenURI: String(ev.args.agentURI),
        owner: String(ev.args.owner).toLowerCase(),
      };
    } catch (e) {
      errors.push(`${rpc}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Base RPC failed after ${errors.length} endpoint(s): ${errors.slice(0, 2).join(" | ")}`);
}

/** agentURI must point at this Concierge registration endpoint for the same agt_ id. */
export function agentUriMatches(expectedUri: string, onChainUri: string): boolean {
  const a = expectedUri.trim().replace(/\/$/, "");
  const b = onChainUri.trim().replace(/\/$/, "");
  if (a === b) return true;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const idA = ua.searchParams.get("id");
    const idB = ub.searchParams.get("id");
    return (
      ua.pathname === ub.pathname &&
      idA === idB &&
      !!idA &&
      idA.startsWith("agt_")
    );
  } catch {
    return false;
  }
}
