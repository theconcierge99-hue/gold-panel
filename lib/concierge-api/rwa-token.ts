import type { CreatorSignal } from "./signals-types";
import type { SignalRwaToken } from "./rwa-types";
import { canonicalJson, sha256Hex } from "./rwa-hash";
import { getSignalRwaToken, saveSignalRwaToken } from "./rwa-store";

export function siteOrigin(): string {
  const fromEnv = process.env.X402_SITE_ORIGIN?.trim().replace(/\/$/, "");
  return fromEnv || "https://conc-exe.xyz";
}

export function rwaTokenIdForSignal(signalId: string): string {
  const slug = signalId.replace(/^sig_/, "");
  return `rwa_${slug}`;
}

function signalMetadataImage(title: string, categories: string[]): string {
  const cat = categories[0] ?? "Markets";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0c1120"/><stop offset="100%" stop-color="#1e2d4a"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <rect x="32" y="32" width="448" height="448" fill="none" stroke="#c9a84c" stroke-width="3"/>
  <text x="256" y="200" text-anchor="middle" fill="#c9a84c" font-family="Georgia,serif" font-size="28">EXECUTIVE LOUNGE</text>
  <text x="256" y="248" text-anchor="middle" fill="#e8e4dc" font-family="Georgia,serif" font-size="22">RWA Signal</text>
  <text x="256" y="300" text-anchor="middle" fill="#8899bb" font-family="sans-serif" font-size="16">${cat.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  <text x="256" y="380" text-anchor="middle" fill="#c9a84c" font-family="monospace" font-size="14">⬡ TOKENIZED</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function contractForChain(chain: "sol" | "evm"): string | undefined {
  if (chain === "sol") return process.env.RWA_SIGNAL_CONTRACT_SOL?.trim() || undefined;
  return process.env.RWA_SIGNAL_CONTRACT_EVM?.trim() || undefined;
}

export async function buildSignalRwaToken(signal: CreatorSignal): Promise<SignalRwaToken> {
  const payload = {
    title: signal.title,
    summary: signal.summary,
    categories: [...signal.categories].sort(),
    creatorWallet: signal.creatorWallet,
    publishedAt: signal.publishedAt,
  };
  const contentHash = await sha256Hex(canonicalJson(payload));
  const tokenId = rwaTokenIdForSignal(signal.id);
  const origin = siteOrigin();

  return {
    tokenId,
    signalId: signal.id,
    standard: "concierge-lounge-rwa-v1",
    assetClass: "intelligence-signal",
    targetChain: signal.creatorChain,
    tokenStandard: signal.creatorChain === "sol" ? "SPL-Asset-Metadata" : "ERC-1155",
    contractAddress: contractForChain(signal.creatorChain),
    contentHash,
    metadata: {
      name: `Lounge Signal · ${signal.title.slice(0, 80)}`,
      description:
        "Tokenized intelligence signal (RWA certificate) issued by Executive Lounge. Full thesis unlocked via x402.",
      image: signalMetadataImage(signal.title, signal.categories),
      external_url: `${origin}/?signal=${encodeURIComponent(signal.id)}`,
      attributes: [
        { trait_type: "Signal ID", value: signal.id },
        { trait_type: "Categories", value: signal.categories.join(", ") },
        { trait_type: "Creator", value: signal.creatorWallet },
        { trait_type: "Chain", value: signal.creatorChain === "sol" ? "Solana" : "Base (EVM)" },
        { trait_type: "Content Hash", value: contentHash },
        { trait_type: "Published", value: signal.publishedAt },
      ],
    },
    issuerWallet: signal.creatorWallet,
    mintedAt: new Date().toISOString(),
    publishTx: signal.publishTx,
  };
}

/** Mint (register) RWA certificate for a published signal. Idempotent per signalId. */
export async function mintSignalRwaToken(signal: CreatorSignal): Promise<SignalRwaToken> {
  const existing = await getSignalRwaToken(signal.id);
  if (existing) return existing;
  const token = await buildSignalRwaToken(signal);
  await saveSignalRwaToken(token);
  return token;
}
