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

export type JsonMerchantRow = {
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
  allowedOrigins?: string[];
  comingSoonMessage?: string;
};

export function isReservedMerchantId(id: string): boolean {
  return RESERVED_MERCHANT_IDS.has(id.trim().toLowerCase());
}

export function isValidMerchantId(id: string): boolean {
  return MERCHANT_ID_RE.test(id.trim().toLowerCase());
}

/** Parse one TOKEN_PAY_MERCHANTS_JSON row with field-level errors (onboarding wizard). */
export function parseMerchantJsonRow(row: JsonMerchantRow): {
  merchant: TokenPayMerchant | null;
  errors: string[];
} {
  const errors: string[] = [];
  const id = (row.id ?? "").trim().toLowerCase();
  if (!id) errors.push("id is required (lowercase slug, e.g. acme)");
  else if (isReservedMerchantId(id)) errors.push(`id "${id}" is reserved`);
  else if (!isValidMerchantId(id)) {
    errors.push("id must match [a-z][a-z0-9_-]{1,31} (2–32 chars, lowercase)");
  }

  const payTo = normalizeSolPayTo(row.payTo ?? "");
  if (!payTo) errors.push("payTo must be a valid Solana receive wallet");

  const mint = normalizeSolanaMint(row.mint ?? "");
  if (!mint) errors.push("mint must be a valid Solana SPL mint (base58)");

  if (
    typeof row.decimals === "number" &&
    (row.decimals < 0 || row.decimals > 12 || !Number.isInteger(row.decimals))
  ) {
    errors.push("decimals must be an integer between 0 and 12");
  }

  const source =
    (row.priceSource ?? "dexscreener").trim().toLowerCase() === "env" ? "env" : "dexscreener";
  if (source === "env") {
    if (typeof row.fallbackUsd !== "number" || row.fallbackUsd <= 0) {
      errors.push("fallbackUsd is required when priceSource is env");
    }
  }

  if (Array.isArray(row.allowedOrigins)) {
    for (const o of row.allowedOrigins) {
      const origin = String(o).trim();
      if (!origin) continue;
      try {
        const u = new URL(origin);
        if (u.protocol !== "https:" && u.protocol !== "http:") {
          errors.push(`allowedOrigins entry must be http(s) URL: ${origin}`);
        }
      } catch {
        errors.push(`allowedOrigins entry is not a valid URL: ${origin}`);
      }
    }
  }

  if (errors.length) return { merchant: null, errors };

  const resourceKinds = Array.isArray(row.resourceKinds)
    ? row.resourceKinds.map(String).filter(Boolean)
    : ["concierge"];
  if (!resourceKinds.length) errors.push("resourceKinds must include at least one route (concierge or external)");
  const allowedOrigins = Array.isArray(row.allowedOrigins)
    ? row.allowedOrigins.map((o) => String(o).trim()).filter(Boolean)
    : undefined;

  const symbol = (row.symbol ?? id).trim() || id;
  const merchant: TokenPayMerchant = {
    id,
    symbol,
    name: (row.name ?? symbol).trim() || symbol,
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
    resourceKinds,
    allowedOrigins: allowedOrigins?.length ? allowedOrigins : undefined,
    comingSoonMessage:
      (row.comingSoonMessage ?? "").trim() || `${symbol} — not available yet.`,
  };

  return { merchant, errors: [] };
}

/** Build env snippet for Vercel / local .env (append or replace array entry). */
export function buildMerchantEnvSnippet(row: JsonMerchantRow): string {
  const compact: JsonMerchantRow = {};
  if (row.id) compact.id = row.id.trim().toLowerCase();
  if (row.symbol) compact.symbol = row.symbol.trim();
  if (row.name) compact.name = row.name.trim();
  if (row.mint) compact.mint = row.mint.trim();
  if (typeof row.decimals === "number") compact.decimals = row.decimals;
  if (row.payTo) compact.payTo = row.payTo.trim();
  if (row.x402Enabled === false) compact.x402Enabled = false;
  if (row.priceSource) compact.priceSource = row.priceSource;
  if (typeof row.fallbackUsd === "number") compact.fallbackUsd = row.fallbackUsd;
  if (typeof row.maxAgeSec === "number") compact.maxAgeSec = row.maxAgeSec;
  if (Array.isArray(row.resourceKinds) && row.resourceKinds.length) {
    compact.resourceKinds = row.resourceKinds;
  }
  if (Array.isArray(row.allowedOrigins) && row.allowedOrigins.length) {
    compact.allowedOrigins = row.allowedOrigins;
  }
  return `TOKEN_PAY_MERCHANTS_JSON=${JSON.stringify([compact])}`;
}

function parseJsonMerchants(solPayTo: string | null): TokenPayMerchant[] {
  const raw = (process.env.TOKEN_PAY_MERCHANTS_JSON ?? "").trim();
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as JsonMerchantRow[];
    if (!Array.isArray(rows)) return [];
    return rows
      .slice(0, MAX_JSON_MERCHANTS)
      .map((row) => parseMerchantJsonRow(row).merchant)
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
    allowedOrigins: merchant.allowedOrigins,
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
