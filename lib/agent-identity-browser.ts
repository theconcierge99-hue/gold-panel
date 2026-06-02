/**
 * Browser-only: generate agent wallets locally and register public keys with Executive Lounge.
 * Private keys never leave the device unless the operator exports them.
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

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
  solAddress?: string;
  evmAddress?: string;
  registeredAt?: string;
};

type RegisterAgentApiRow = StoredAgentIdentity & { id?: string; createdAt?: string };

const STORAGE_KEY = "el-agent-identity";
const WALLET_STORAGE_KEY = "el-agent-wallet-secrets";

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
    solAddress: row.solAddress,
    evmAddress: row.evmAddress,
    registeredAt: row.createdAt ?? row.registeredAt ?? new Date().toISOString(),
  };
  if (!identity.agentId) {
    return { ok: false, agent: identity, error: "Invalid server response" };
  }
  saveAgentIdentityLocal(identity);
  return { ok: true, agent: identity, card: (data as { card?: unknown }).card };
}

declare global {
  interface Window {
    elGenerateAgentWallets?: typeof generateAgentWallets;
    elRegisterAgentIdentity?: typeof registerAgentIdentity;
    elLoadAgentIdentity?: typeof loadAgentIdentityLocal;
    elGetStoredAgentId?: typeof getStoredAgentId;
    elSaveAgentWalletSecrets?: typeof saveWalletSecretsLocal;
  }
}

if (typeof window !== "undefined") {
  window.elGenerateAgentWallets = generateAgentWallets;
  window.elRegisterAgentIdentity = registerAgentIdentity;
  window.elLoadAgentIdentity = loadAgentIdentityLocal;
  window.elGetStoredAgentId = getStoredAgentId;
  window.elSaveAgentWalletSecrets = saveWalletSecretsLocal;
}
