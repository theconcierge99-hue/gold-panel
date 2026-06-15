/** Edge-safe Solana RPC helpers for x402 merchant diagnostics */

/** USDC mint (mainnet) — inlined to avoid circular import with x402-config */
const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Normalize Helius / custom RPC URLs from Vercel (quotes, trailing slash) */
export function normalizeSolanaRpcUrl(raw: string | undefined | null): string | null {
  const s = (raw ?? "").trim().replace(/^['"`]+|['"`]+$/g, "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function rpcErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err ?? "RPC error");
  const o = err as { message?: string; data?: unknown };
  if (o.message) return o.message;
  return JSON.stringify(err).slice(0, 400);
}

export async function solanaRpcCallEx<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 15_000,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  const url = normalizeSolanaRpcUrl(rpcUrl) ?? rpcUrl.trim();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, error: `RPC HTTP ${res.status}` };
    }
    const data = (await res.json()) as { result?: T; error?: unknown };
    if (data.error) {
      return { ok: false, error: rpcErrorMessage(data.error) };
    }
    if (data.result === undefined) {
      return { ok: false, error: "RPC returned no result" };
    }
    return { ok: true, result: data.result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "RPC request failed" };
  }
}

export async function solanaRpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T | null> {
  const out = await solanaRpcCallEx<T>(rpcUrl, method, params);
  return out.ok ? out.result : null;
}

function sumParsedTokenBalances(rows: unknown[] | undefined): bigint {
  let total = 0n;
  for (const row of rows ?? []) {
    const acct = row as {
      account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } };
    };
    const amt = acct.account?.data?.parsed?.info?.tokenAmount?.amount;
    if (amt) total += BigInt(amt);
  }
  return total;
}

/** Token balance in atomic units; null when RPC failed */
export async function getSolTokenBalanceAtomic(
  ownerAddress: string,
  mint: string,
  rpcUrl: string,
): Promise<bigint | null> {
  const result = await solanaRpcCall<{ value?: unknown[] }>(rpcUrl, "getTokenAccountsByOwner", [
    ownerAddress,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  if (result === null) return null;
  return sumParsedTokenBalances(result.value);
}

/** True when merchant has a token account for mint */
export async function merchantHasTokenAccount(
  ownerAddress: string,
  mint: string,
  rpcUrl?: string,
): Promise<boolean | null> {
  const url = normalizeSolanaRpcUrl(rpcUrl) ?? rpcUrl?.trim() ?? "https://solana-rpc.publicnode.com";
  const result = await solanaRpcCall<{ value?: unknown[] }>(url, "getTokenAccountsByOwner", [
    ownerAddress,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  if (result === null) return null;
  return (result.value?.length ?? 0) > 0;
}

/** USDC balance in atomic units (6 decimals); null when RPC failed */
export async function getSolUsdcBalanceAtomic(
  ownerAddress: string,
  rpcUrl: string,
): Promise<bigint | null> {
  const result = await solanaRpcCall<{ value?: unknown[] }>(rpcUrl, "getTokenAccountsByOwner", [
    ownerAddress,
    { mint: USDC_MINT_MAINNET },
    { encoding: "jsonParsed" },
  ]);
  if (result === null) return null;
  return sumParsedTokenBalances(result.value);
}

/** True when merchant already has a USDC token account (can receive transferChecked) */
export async function merchantHasUsdcTokenAccount(
  ownerAddress: string,
  rpcUrl?: string,
): Promise<boolean | null> {
  const url = normalizeSolanaRpcUrl(rpcUrl) ?? rpcUrl?.trim() ?? "https://solana-rpc.publicnode.com";
  const result = await solanaRpcCall<{ value?: unknown[] }>(url, "getTokenAccountsByOwner", [
    ownerAddress,
    { mint: USDC_MINT_MAINNET },
    { encoding: "jsonParsed" },
  ]);
  if (result === null) return null;
  return (result.value?.length ?? 0) > 0;
}
