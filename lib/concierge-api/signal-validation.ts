import { LIMITS } from "./concierge-security";
import type { SignalOpenBody, SignalPublishBody } from "./signals-types";

const MAX_CATEGORIES = 6;
const MAX_CATEGORY_LEN = 40;

const ALLOWED_CATEGORIES = new Set([
  "Technology",
  "Macro",
  "Micro",
  "Geopolitics",
  "Crypto",
  "Stocks",
  "Energy",
  "Equities",
  "Oil",
  "Gold / Silver",
  "Other",
]);

function cleanText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .trim()
    .slice(0, max);
}

function isSolWallet(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function isEvmWallet(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export function parseSignalPublishBody(raw: string): SignalPublishBody {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!data || typeof data !== "object") throw new Error("Invalid request body");
  const o = data as Record<string, unknown>;

  const title = cleanText(o.title, 240);
  const summary = cleanText(o.summary, LIMITS.maxSignalFieldChars);
  if (!title) throw new Error("Title is required");
  if (summary.length < 40) throw new Error("Summary must be at least 40 characters");

  const catsRaw = o.categories;
  if (!Array.isArray(catsRaw) || !catsRaw.length) {
    throw new Error("Select at least one category");
  }
  const categories = catsRaw
    .map((c) => cleanText(c, MAX_CATEGORY_LEN))
    .filter((c) => ALLOWED_CATEGORIES.has(c))
    .slice(0, MAX_CATEGORIES);
  if (!categories.length) throw new Error("Invalid categories");

  const creatorWallet = cleanText(o.creatorWallet, 64);
  const chain = o.creatorChain === "sol" || o.creatorChain === "evm" ? o.creatorChain : null;
  if (!chain) throw new Error("creatorChain must be sol or evm");
  if (chain === "sol" && !isSolWallet(creatorWallet)) {
    throw new Error("Invalid Solana creator wallet");
  }
  if (chain === "evm" && !isEvmWallet(creatorWallet)) {
    throw new Error("Invalid EVM creator wallet");
  }

  return { title, summary, categories, creatorWallet, creatorChain: chain };
}

export function parseSignalOpenBody(raw: string): SignalOpenBody {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!data || typeof data !== "object") throw new Error("Invalid request body");
  const id = cleanText((data as Record<string, unknown>).signalId, 64);
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) throw new Error("Invalid signal id");
  return { signalId: id };
}
