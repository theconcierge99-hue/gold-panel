import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authorizeInternalApi } from "../lib/concierge-api/lounge-internal-auth";

/** Node + @vercel/node handler — Metaplex (not Edge-compatible). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const pseudoRequest = new Request("https://internal/lounge-rwa-mint-sol", {
    method: "POST",
    headers: { authorization: String(req.headers.authorization ?? "") },
  });
  if (!authorizeInternalApi(pseudoRequest)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const body = (typeof req.body === "object" && req.body ? req.body : {}) as {
      signalId?: string;
    };
    const signalId = String(body.signalId ?? "").trim();
    if (!signalId) {
      res.status(400).json({ error: "signalId required" });
      return;
    }

    const { getSignalById } = await import("../lib/concierge-api/signal-store");
    const signal = await getSignalById(signalId);
    if (!signal) {
      res.status(404).json({ error: "Signal not found" });
      return;
    }

    const { mintSolanaSignalNftForSignal } = await import("../lib/concierge-api/rwa-solana-mint");
    const solanaNft = await mintSolanaSignalNftForSignal(signal);

    res.status(200).json({ ok: true, solanaNft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lounge-rwa-mint-sol]", e instanceof Error ? e.stack || msg : msg);
    res.status(500).json({ error: msg.slice(0, 200) || "Mint failed" });
  }
}
