/**
 * Browser-only: generate agent wallets locally and register public keys with Executive Lounge.
 * Private keys never leave the device unless the operator exports them.
 * Optional: mint ERC-8004 Identity on Base and link to `agt_…`.
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base as baseChain } from "viem/chains";

export type GeneratedAgentWallets = {
  solAddress: string;
  solSecretBase58: string;
  evmAddress: `0x${string}`;
  evmPrivateKey: `0x${string}`;
  createdAt: string;
};

export type StoredAgentIdentity = {
  agentId: string;
  name: string;
  cardUrl: string;
  profileUrl: string;
  registrationUrl?: string;
  solAddress?: string;
  evmAddress?: string;
  registeredAt?: string;
  erc8004?: {
    agentId: string;
    agentRegistry: string;
    txHash: string;
    explorerTx?: string;
    explorerToken?: string;
    onChain?: boolean;
  };
};

type RegisterAgentApiRow = StoredAgentIdentity & {
  id?: string;
  createdAt?: string;
  erc8004?: StoredAgentIdentity["erc8004"];
};

const STORAGE_KEY = "el-agent-identity";
const WALLET_STORAGE_KEY = "el-agent-wallet-secrets";

const ERC8004_IDENTITY_REGISTRY =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const ERC8004_IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
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

export function generateAgentWallets(): GeneratedAgentWallets {
  const solKp = Keypair.generate();
  const evmPrivateKey = generatePrivateKey();
  const evmAccount = privateKeyToAccount(evmPrivateKey);
  return {
    solAddress: solKp.publicKey.toBase58(),
    solSecretBase58: bs58.encode(solKp.secretKey),
    evmAddress: evmAccount.address,
    evmPrivateKey,
    createdAt: new Date().toISOString(),
  };
}

export function saveWalletSecretsLocal(wallets: GeneratedAgentWallets): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    WALLET_STORAGE_KEY,
    JSON.stringify({
      solSecretBase58: wallets.solSecretBase58,
      evmPrivateKey: wallets.evmPrivateKey,
      savedAt: wallets.createdAt,
    }),
  );
}

export function loadWalletSecretsLocal(): {
  solSecretBase58?: string;
  evmPrivateKey?: string;
} | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { solSecretBase58?: string; evmPrivateKey?: string };
  } catch {
    return null;
  }
}

export function clearAgentIdentityLocal(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WALLET_STORAGE_KEY);
}

export function saveAgentIdentityLocal(identity: StoredAgentIdentity): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function loadAgentIdentityLocal(): StoredAgentIdentity | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAgentIdentity;
  } catch {
    return null;
  }
}

export function getStoredAgentId(): string | null {
  return loadAgentIdentityLocal()?.agentId ?? null;
}

export async function registerAgentIdentity(
  origin: string,
  input: {
    name: string;
    description?: string;
    solAddress?: string;
    evmAddress?: string;
  },
): Promise<{ ok: boolean; agent: StoredAgentIdentity; card?: unknown; error?: string }> {
  const base = origin.replace(/\/$/, "");
  const res = await fetch(`${base}/api/agent-identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    agent?: RegisterAgentApiRow;
    error?: string;
  };
  if (!res.ok || !data.agent) {
    return { ok: false, agent: data.agent as StoredAgentIdentity, error: data.error || `HTTP ${res.status}` };
  }
  const row = data.agent;
  const identity: StoredAgentIdentity = {
    agentId: row.id ?? row.agentId ?? "",
    name: row.name,
    cardUrl: row.cardUrl,
    profileUrl: row.profileUrl,
    registrationUrl: row.registrationUrl,
    solAddress: row.solAddress,
    evmAddress: row.evmAddress,
    registeredAt: row.createdAt ?? row.registeredAt ?? new Date().toISOString(),
    erc8004: row.erc8004,
  };
  if (!identity.agentId) {
    return { ok: false, agent: identity, error: "Invalid server response" };
  }
  saveAgentIdentityLocal(identity);
  return { ok: true, agent: identity, card: (data as { card?: unknown }).card };
}

export type Erc8004MintResult = {
  ok: boolean;
  agent?: StoredAgentIdentity;
  onChainAgentId?: string;
  txHash?: string;
  explorerTx?: string;
  error?: string;
};

/**
 * Mint ERC-8004 Identity on Base with the locally stored agent EVM key,
 * then link the tokenId to Concierge `agt_…` (server verifies owner + tokenURI).
 */
export async function registerAgentOnChain8004(
  origin: string,
  options?: { agentId?: string; rpcUrl?: string },
): Promise<Erc8004MintResult> {
  const base = origin.replace(/\/$/, "");
  const local = loadAgentIdentityLocal();
  const agentId = options?.agentId || local?.agentId;
  if (!agentId) return { ok: false, error: "No agent identity in this browser — register first" };

  const secrets = loadWalletSecretsLocal();
  const pk = secrets?.evmPrivateKey as Hex | undefined;
  if (!pk || !pk.startsWith("0x")) {
    return {
      ok: false,
      error: "EVM private key not found in this browser — regenerate wallets or import secrets",
    };
  }

  const prepRes = await fetch(
    `${base}/api/agent-identity-erc8004?id=${encodeURIComponent(agentId)}`,
  );
  const prep = (await prepRes.json().catch(() => ({}))) as {
    ok?: boolean;
    agentURI?: string;
    alreadyLinked?: boolean;
    linked?: { agentId?: string; txHash?: string; explorerTx?: string };
    error?: string;
  };
  if (!prepRes.ok || !prep.agentURI) {
    return { ok: false, error: prep.error || `Prepare failed HTTP ${prepRes.status}` };
  }
  if (prep.alreadyLinked && prep.linked?.agentId) {
    const next = {
      ...(local as StoredAgentIdentity),
      agentId,
      erc8004: {
        agentId: String(prep.linked.agentId),
        agentRegistry: `eip155:8453:${ERC8004_IDENTITY_REGISTRY}`,
        txHash: String(prep.linked.txHash || ""),
        explorerTx: prep.linked.explorerTx,
        onChain: true,
      },
    };
    saveAgentIdentityLocal(next);
    return {
      ok: true,
      agent: next,
      onChainAgentId: String(prep.linked.agentId),
      txHash: prep.linked.txHash,
      explorerTx: prep.linked.explorerTx,
    };
  }

  const account = privateKeyToAccount(pk);
  const rpc = options?.rpcUrl || "https://mainnet.base.org";
  const publicClient = createPublicClient({ chain: baseChain, transport: http(rpc) });
  const walletClient = createWalletClient({
    account,
    chain: baseChain,
    transport: http(rpc),
  });

  try {
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance === 0n) {
      return {
        ok: false,
        error:
          `Agent EVM wallet has 0 ETH on Base. Send a little ETH on Base to ${account.address} (not your Connect wallet), then mint again.`,
      };
    }

    const hash = await walletClient.writeContract({
      address: ERC8004_IDENTITY_REGISTRY,
      abi: ERC8004_IDENTITY_ABI,
      functionName: "register",
      args: [prep.agentURI],
      chain: baseChain,
      account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({
      abi: ERC8004_IDENTITY_ABI,
      eventName: "Registered",
      logs: receipt.logs,
    });
    const registered = logs[0];
    if (!registered) {
      return { ok: false, error: "Mint succeeded but Registered event not found", txHash: hash };
    }
    const onChainAgentId = String(registered.args.agentId);

    const linkRes = await fetch(`${base}/api/agent-identity-erc8004`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agentId, agentId: onChainAgentId, txHash: hash }),
    });
    const linkData = (await linkRes.json().catch(() => ({}))) as {
      ok?: boolean;
      agent?: RegisterAgentApiRow;
      error?: string;
    };
    if (!linkRes.ok || !linkData.agent) {
      return {
        ok: false,
        error: linkData.error || `Link failed HTTP ${linkRes.status}`,
        onChainAgentId,
        txHash: hash,
        explorerTx: `https://basescan.org/tx/${hash}`,
      };
    }

    const row = linkData.agent;
    const identity: StoredAgentIdentity = {
      agentId: row.id ?? row.agentId ?? agentId,
      name: row.name || local?.name || "",
      cardUrl: row.cardUrl || local?.cardUrl || "",
      profileUrl: row.profileUrl || local?.profileUrl || "",
      registrationUrl: row.registrationUrl,
      solAddress: row.solAddress || local?.solAddress,
      evmAddress: row.evmAddress || local?.evmAddress,
      registeredAt: row.createdAt || local?.registeredAt,
      erc8004: row.erc8004,
    };
    saveAgentIdentityLocal(identity);
    return {
      ok: true,
      agent: identity,
      onChainAgentId,
      txHash: hash,
      explorerTx: row.erc8004?.explorerTx || `https://basescan.org/tx/${hash}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

declare global {
  interface Window {
    elGenerateAgentWallets?: typeof generateAgentWallets;
    elRegisterAgentIdentity?: typeof registerAgentIdentity;
    elRegisterAgentOnChain8004?: typeof registerAgentOnChain8004;
    elLoadAgentIdentity?: typeof loadAgentIdentityLocal;
    elGetStoredAgentId?: typeof getStoredAgentId;
    elSaveAgentWalletSecrets?: typeof saveWalletSecretsLocal;
    elClearAgentIdentity?: typeof clearAgentIdentityLocal;
  }
}

if (typeof window !== "undefined") {
  window.elGenerateAgentWallets = generateAgentWallets;
  window.elRegisterAgentIdentity = registerAgentIdentity;
  window.elRegisterAgentOnChain8004 = registerAgentOnChain8004;
  window.elLoadAgentIdentity = loadAgentIdentityLocal;
  window.elGetStoredAgentId = getStoredAgentId;
  window.elSaveAgentWalletSecrets = saveWalletSecretsLocal;
  window.elClearAgentIdentity = clearAgentIdentityLocal;
}
