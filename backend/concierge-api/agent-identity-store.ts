import type { AgentIdentityRecord, AgentPublicView } from "./agent-identity-types";

const INDEX_KEY = "lounge:agents:index";
const MAX_AGENTS = 5_000;
const devAgents: AgentIdentityRecord[] = [];

function hasRedis(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url?.trim() && token?.trim());
}

async function kvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

function agentKey(id: string): string {
  return `lounge:agent:${id}`;
}

function walletKey(sol?: string, evm?: string): string {
  const parts = [sol?.toLowerCase() ?? "", evm?.toLowerCase() ?? ""].filter(Boolean).sort();
  return `lounge:agent:wallet:${parts.join(":")}`;
}

export function generateAgentId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `agt_${hex}`;
}

export function normalizeSolAddress(raw: string): string | null {
  const s = raw.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return null;
  return s;
}

export function normalizeEvmAddress(raw: string): string | null {
  let a = raw.trim();
  if (!a.startsWith("0x")) a = `0x${a}`;
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return null;
  return a.toLowerCase();
}

/** SAP agent PDA / escrow — base58 Solana pubkey */
export function normalizeSapAgentPda(raw: string): string | null {
  const s = raw.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return null;
  return s;
}

export function toPublicView(origin: string, rec: AgentIdentityRecord): AgentPublicView {
  const base = origin.replace(/\/$/, "");
  const sapVerified = !!(rec.sapWallet && rec.sapAgentPda);
  return {
    id: rec.id,
    name: rec.name,
    description: rec.description,
    solAddress: rec.solAddress,
    evmAddress: rec.evmAddress,
    sapWallet: rec.sapWallet,
    sapAgentPda: rec.sapAgentPda,
    sapVerified,
    createdAt: rec.createdAt,
    cardUrl: `${base}/api/agent-identity-card?id=${encodeURIComponent(rec.id)}`,
    profileUrl: `${base}/api/agent-identity?id=${encodeURIComponent(rec.id)}`,
  };
}

export async function getAgentById(id: string): Promise<AgentIdentityRecord | null> {
  const aid = id.trim();
  if (!/^agt_[a-f0-9]{8,32}$/i.test(aid)) return null;
  if (hasRedis()) {
    const kv = await kvClient();
    return (await kv.get<AgentIdentityRecord>(agentKey(aid))) ?? null;
  }
  return devAgents.find((a) => a.id === aid) ?? null;
}

export async function findAgentByWallets(
  sol?: string,
  evm?: string,
): Promise<AgentIdentityRecord | null> {
  if (!sol && !evm) return null;
  const wk = walletKey(sol, evm);
  if (hasRedis()) {
    const kv = await kvClient();
    const existingId = await kv.get<string>(wk);
    if (!existingId) return null;
    return getAgentById(existingId);
  }
  return (
    devAgents.find(
      (a) =>
        (!sol || a.solAddress === sol) &&
        (!evm || a.evmAddress?.toLowerCase() === evm.toLowerCase()),
    ) ?? null
  );
}

export async function registerAgent(input: {
  name: string;
  description?: string;
  solAddress?: string;
  evmAddress?: string;
  sapWallet?: string;
  sapAgentPda?: string;
}): Promise<AgentIdentityRecord> {
  const existing = await findAgentByWallets(input.solAddress, input.evmAddress);
  if (existing) {
    if (input.sapWallet || input.sapAgentPda) {
      const linked = await linkAgentSap(existing.id, {
        sapWallet: input.sapWallet,
        sapAgentPda: input.sapAgentPda,
      });
      return linked ?? existing;
    }
    return existing;
  }

  const rec: AgentIdentityRecord = {
    id: generateAgentId(),
    name: input.name,
    description: input.description,
    solAddress: input.solAddress,
    evmAddress: input.evmAddress,
    sapWallet: input.sapWallet,
    sapAgentPda: input.sapAgentPda,
    createdAt: new Date().toISOString(),
  };

  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(agentKey(rec.id), rec);
    await kv.set(walletKey(input.solAddress, input.evmAddress), rec.id);
    const ids = (await kv.get<string[]>(INDEX_KEY)) ?? [];
    const next = [rec.id, ...ids.filter((x) => x !== rec.id)].slice(0, MAX_AGENTS);
    await kv.set(INDEX_KEY, next);
    return rec;
  }

  devAgents.unshift(rec);
  if (devAgents.length > MAX_AGENTS) devAgents.length = MAX_AGENTS;
  return rec;
}

export async function listAgents(limit = 24): Promise<AgentIdentityRecord[]> {
  const cap = Math.min(Math.max(limit, 1), 50);
  if (hasRedis()) {
    const kv = await kvClient();
    const ids = (await kv.get<string[]>(INDEX_KEY)) ?? [];
    const out: AgentIdentityRecord[] = [];
    for (const id of ids.slice(0, cap)) {
      const a = await getAgentById(id);
      if (a) out.push(a);
    }
    return out;
  }
  return devAgents.slice(0, cap);
}

async function persistAgent(rec: AgentIdentityRecord): Promise<void> {
  if (hasRedis()) {
    const kv = await kvClient();
    await kv.set(agentKey(rec.id), rec);
    return;
  }
  const idx = devAgents.findIndex((a) => a.id === rec.id);
  if (idx >= 0) devAgents[idx] = rec;
}

export async function linkAgentSap(
  id: string,
  input: { sapWallet?: string; sapAgentPda?: string },
): Promise<AgentIdentityRecord | null> {
  const agent = await getAgentById(id);
  if (!agent) return null;

  const sapWallet = input.sapWallet ? normalizeSolAddress(input.sapWallet) : undefined;
  const sapAgentPda = input.sapAgentPda ? normalizeSapAgentPda(input.sapAgentPda) : undefined;
  if (input.sapWallet && !sapWallet) return null;
  if (input.sapAgentPda && !sapAgentPda) return null;

  if (sapWallet && agent.solAddress && sapWallet !== agent.solAddress) {
    throw new Error("sapWallet must match solAddress when both are set");
  }

  const updated: AgentIdentityRecord = {
    ...agent,
    sapWallet: sapWallet ?? agent.sapWallet,
    sapAgentPda: sapAgentPda ?? agent.sapAgentPda,
  };
  await persistAgent(updated);
  return updated;
}
