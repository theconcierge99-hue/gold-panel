/**
 * Token Pay merchant registry — env-backed today, JSON extensible for partner projects.
 */
import { cleanEnvAddress, normalizeSolPayTo } from "../x402-address";
import { normalizeSolanaMint } from "./mint";
import { buildSoonMerchantFromEnv, SOON_MERCHANT_ID } from "./merchants/soon";
import type { TokenPayMerchant, TokenPayPlatformMeta, TokenPayPublicMerchant } from "./types";

const PLATFORM_NAME = "Concierge Token Pay";
const PLATFORM_VERSION = "0.1.0";

/** Reserved slugs — cannot be registered via TOKEN_PAY_MERCHANTS_JSON. */
const RESERVED_MERCHANT_IDS = new Set([SOON_MERCHANT_ID]);

/** External merchant slug: lowercase letter first, then [a-z0-9_-], 2–32 chars total. */
const MERCHANT_ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;

const MAX_JSON_MERCHANTS = 16;

let registryCache: { merchants: Map<string, TokenPayMerchant>; defaultId: string } | null = null;

function solPayToFromEnv(): string | null {
  const raw = process.env.X402_SOL_PAY_TO || process.env.X402_SOL_PAY_ID;
  return normalizeSolPayTo(cleanEnvAddress(raw) || undefined);
}

function defaultMerchantId(): string {
  return (process.env.TOKEN_PAY_DEFAULT_MERCHANT ?? SOON_MERCHANT_ID).trim() || SOON_MERCHANT_ID;
}

type JsonMerchantRow = {
  id?: string;
  symbol?: string;
  name?: string;
  mint?: string;
  decimals?: number;
  payTo?: string;
  x402Enabled?: boolean;
  priceSource?: string;
  fallbackUsd?: number;
  maxAgeSec?: number;
  usdMin?: number;
  usdMax?: number;
  resourceKinds?: string[];
  comingSoonMessage?: string;
};

function parseJsonMerchants(solPayTo: string | null): TokenPayMerchant[] {
  const raw = (process.env.TOKEN_PAY_MERCHANTS_JSON ?? "").trim();
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as JsonMerchantRow[];
    if (!Array.isArray(rows)) return [];
    return rows
      .slice(0, MAX_JSON_MERCHANTS)
      .map((row): TokenPayMerchant | null => {
        const id = (row.id ?? "").trim().toLowerCase();
        if (!id || RESERVED_MERCHANT_IDS.has(id) || !MERCHANT_ID_RE.test(id)) return null;

        const payTo = normalizeSolPayTo(row.payTo ?? "");
        if (!payTo) return null;

        const mint = normalizeSolanaMint(row.mint ?? "");
        if (!mint) return null;

        const source =
          (row.priceSource ?? "dexscreener").trim().toLowerCase() === "env" ? "env" : "dexscreener";
        return {
          id,
          symbol: (row.symbol ?? id).trim() || id,
          name: (row.name ?? row.symbol ?? id).trim() || id,
          mint,
          decimals:
            typeof row.decimals === "number" && row.decimals >= 0 && row.decimals <= 12
              ? Math.floor(row.decimals)
              : 6,
          payTo,
          x402Enabled: row.x402Enabled !== false,
          price: {
            source,
            fallbackUsd:
              typeof row.fallbackUsd === "number" && row.fallbackUsd > 0 ? row.fallbackUsd : null,
            maxAgeSec:
              typeof row.maxAgeSec === "number" && row.maxAgeSec >= 10
                ? Math.min(row.maxAgeSec, 300)
                : 60,
            usdMin: typeof row.usdMin === "number" && row.usdMin > 0 ? row.usdMin : null,
            usdMax: typeof row.usdMax === "number" && row.usdMax > 0 ? row.usdMax : null,
          },
          resourceKinds: Array.isArray(row.resourceKinds) ? row.resourceKinds.map(String) : ["concierge"],
          comingSoonMessage:
            (row.comingSoonMessage ?? "").trim() ||
            `${row.symbol ?? id} — not available yet.`,
        };
      })
      .filter((m): m is TokenPayMerchant => m !== null);
  } catch {
    return [];
  }
}

function loadRegistry(): { merchants: Map<string, TokenPayMerchant>; defaultId: string } {
  const solPayTo = solPayToFromEnv();
  const map = new Map<string, TokenPayMerchant>();

  map.set(SOON_MERCHANT_ID, buildSoonMerchantFromEnv(solPayTo));

  for (const m of parseJsonMerchants(solPayTo)) {
    map.set(m.id, m);
  }

  const defaultId = defaultMerchantId();
  return { merchants: map, defaultId };
}

function getRegistry() {
  if (!registryCache) registryCache = loadRegistry();
  return registryCache;
}

/** Bust cache after env change (tests). */
export function clearTokenPayRegistryCache(): void {
  registryCache = null;
}

export function listTokenPayMerchants(): TokenPayMerchant[] {
  return [...getRegistry().merchants.values()];
}

export function getTokenPayMerchant(id: string): TokenPayMerchant | null {
  return getRegistry().merchants.get(id) ?? null;
}

export function getDefaultTokenPayMerchant(): TokenPayMerchant {
  const { merchants, defaultId } = getRegistry();
  return merchants.get(defaultId) ?? merchants.get(SOON_MERCHANT_ID)!;
}

export function getDefaultTokenPayMerchantId(): string {
  return getRegistry().defaultId;
}

export function isTokenPayMerchantLive(merchant: TokenPayMerchant): boolean {
  if (!merchant.x402Enabled || !merchant.mint || !merchant.payTo) return false;
  if (merchant.price.source === "env") return merchant.price.fallbackUsd !== null;
  return true;
}

export function merchantSupportsResource(merchant: TokenPayMerchant, resourceKind: string): boolean {
  return merchant.resourceKinds.includes(resourceKind);
}

export function toPublicMerchant(merchant: TokenPayMerchant): TokenPayPublicMerchant {
  return {
    id: merchant.id,
    symbol: merchant.symbol,
    name: merchant.name,
    mint: merchant.mint ?? undefined,
    decimals: merchant.decimals,
    x402Enabled: merchant.x402Enabled,
    live: isTokenPayMerchantLive(merchant),
    priceSource: merchant.price.source,
    fallbackUsd: merchant.price.fallbackUsd ?? undefined,
    resourceKinds: merchant.resourceKinds,
    comingSoonMessage: merchant.comingSoonMessage,
  };
}

export function getTokenPayPlatformMeta(): TokenPayPlatformMeta {
  const merchants = listTokenPayMerchants();
  const defaultId = getDefaultTokenPayMerchantId();
  const def = getTokenPayMerchant(defaultId);
  return {
    name: PLATFORM_NAME,
    version: PLATFORM_VERSION,
    settlement: "self",
    priceOracle: def?.price.source ?? "dexscreener",
    defaultMerchantId: defaultId,
    merchantCount: merchants.length,
    note: "Self-settle SPL x402 — user pays SOL gas. Add merchants via TOKEN_PAY_MERCHANTS_JSON.",
  };
}
