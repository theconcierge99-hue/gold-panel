/** Metaplex on-chain metadata `name` field — max 32 bytes (UTF-8), not 32 JS chars. */
export function truncateOnChainMetaName(name: string, maxBytes = 32): string {
  const enc = new TextEncoder();
  let s = name.trim() || "Lounge Signal";
  while (enc.encode(s).length > maxBytes && s.length > 0) {
    s = s.slice(0, -1);
  }
  return s.trim() || "Lounge Signal";
}
