/** Edge-safe Solana RPC helpers for x402 merchant diagnostics */

import { SOLANA_MAINNET_CAIP2, getUsdcAssetForNetwork } from "./x402-config";

const USDC_MINT_MAINNET = getUsdcAssetForNetwork(SOLANA_MAINNET_CAIP2);

export async function solanaRpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: T; error?: unknown };
    if (data.error) return null;
    return data.result ?? null;
  } catch {
    return null;
  }
}

/** True when merchant already has a USDC token account (can receive transferChecked) */
export async function merchantHasUsdcTokenAccount(
  ownerAddress: string,
  rpcUrl?: string,
): Promise<boolean | null> {
  const url = (rpcUrl || "https://solana-rpc.publicnode.com").trim();
  const result = await solanaRpcCall<{ value?: unknown[] }>(url, "getTokenAccountsByOwner", [
    ownerAddress,
    { mint: USDC_MINT_MAINNET },
    { encoding: "jsonParsed" },
  ]);
  if (result === null) return null;
  return (result.value?.length ?? 0) > 0;
}
