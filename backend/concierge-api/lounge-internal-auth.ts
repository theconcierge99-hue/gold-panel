/** Edge-safe auth for server-to-server calls (mint, creator payout). */

export function authorizeInternalApi(request: Request): boolean {
  const secret =
    process.env.LOUNGE_INTERNAL_KEY?.trim() || process.env.RWA_MINT_INTERNAL_KEY?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}

export function internalAuthHeaders(): Record<string, string> {
  const secret =
    process.env.LOUNGE_INTERNAL_KEY?.trim() || process.env.RWA_MINT_INTERNAL_KEY?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

export function loungeApiOrigin(): string {
  return process.env.X402_SITE_ORIGIN?.trim().replace(/\/$/, "") || "https://conc-exe.xyz";
}
