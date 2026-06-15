/**
 * Token Pay UI branding — change symbol/name here when default merchant renames (still "SOON" today).
 */
export const TOKEN_PAY_DEFAULT_SYMBOL = "SOON";
export const TOKEN_PAY_DEFAULT_NAME = "SOON";

export const TOKEN_PAY_COMING_SOON_DEFAULT =
  "SOON — not available yet. Will unlock after token launch.";

export type TokenPayServerSlice = {
  defaultMerchantId?: string;
  symbol?: string;
  name?: string;
  mint?: string;
  decimals?: number;
  live?: boolean;
  acceptsTokenPay?: boolean;
  acceptsSoonSol?: boolean;
  usdcRate?: number;
  conciergeAtomic?: string;
  comingSoonMessage?: string;
  solMerchantTokenAta?: boolean | null;
  solMerchantSoonAta?: boolean | null;
};

/** Normalize /api/x402-config tokenPay + legacy soonX402 fields. */
export function tokenPayFromX402Config(cfg: Record<string, unknown> | null | undefined): TokenPayServerSlice {
  const tp = cfg?.tokenPay as Record<string, unknown> | undefined;
  const def = tp?.default as Record<string, unknown> | undefined;
  const soon = cfg?.soonX402 as Record<string, unknown> | undefined;

  const symbol =
    (def?.symbol as string) ||
    ((tp?.defaultMerchant as Record<string, unknown>)?.symbol as string) ||
    TOKEN_PAY_DEFAULT_SYMBOL;

  return {
    defaultMerchantId:
      (tp?.defaultMerchantId as string) ||
      (def?.id as string) ||
      "soon",
    symbol,
    name: (def?.name as string) || symbol || TOKEN_PAY_DEFAULT_NAME,
    mint: (cfg?.tokenPayMint as string) || (cfg?.soonMint as string) || (def?.mint as string) || (soon?.mint as string),
    decimals:
      (def?.decimals as number) ??
      (soon?.decimals as number) ??
      6,
    live: (def?.live as boolean) ?? (soon?.enabled as boolean) ?? false,
    acceptsTokenPay:
      !!(cfg?.acceptsTokenPaySol ?? cfg?.acceptsSoonSol),
    acceptsSoonSol: !!(cfg?.acceptsTokenPaySol ?? cfg?.acceptsSoonSol),
    usdcRate:
      (cfg?.tokenUsdcRate as number) ??
      (cfg?.soonUsdcRate as number) ??
      (soon?.usdcRate as number),
    conciergeAtomic:
      (cfg?.tokenConciergeAtomic as string) ||
      (cfg?.soonConciergeAtomic as string) ||
      (def?.conciergeAtomic as string) ||
      (soon?.conciergeAtomic as string),
    comingSoonMessage:
      (def?.comingSoonMessage as string) || TOKEN_PAY_COMING_SOON_DEFAULT,
    solMerchantTokenAta:
      (cfg?.solMerchantTokenAta as boolean | null) ??
      (cfg?.solMerchantSoonAta as boolean | null),
    solMerchantSoonAta:
      (cfg?.solMerchantTokenAta as boolean | null) ??
      (cfg?.solMerchantSoonAta as boolean | null),
  };
}

export function isTokenPayLive(slice: TokenPayServerSlice): boolean {
  return !!(
    slice.live &&
    slice.mint &&
    slice.acceptsTokenPay &&
    slice.conciergeAtomic
  );
}
