import type { SignalRwaToken } from "./rwa-types";

/** Metaplex-compatible off-chain JSON (served at /api/rwa-metadata). */
export function metaplexMetadataJson(token: SignalRwaToken): Record<string, unknown> {
  const m = token.metadata;
  return {
    name: m.name,
    symbol: "LOUNGE",
    description: m.description,
    image: m.image,
    external_url: m.external_url,
    attributes: m.attributes,
    properties: {
      files: [{ uri: m.image, type: "image/svg+xml" }],
      category: "image",
      creators: [{ address: token.issuerWallet, share: 100 }],
    },
  };
}

export function rwaMetadataUri(signalId: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/rwa-metadata?signalId=${encodeURIComponent(signalId)}`;
}
