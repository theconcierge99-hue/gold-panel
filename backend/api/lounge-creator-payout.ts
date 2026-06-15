import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authorizeInternalApi } from "../concierge-api/lounge-internal-auth";
import type { CreatorPayoutResult } from "../concierge-api/creator-payout-types";

/** Node + @vercel/node handler — SPL / ERC-20 transfers. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const pseudoRequest = new Request("https://internal/lounge-creator-payout", {
    method: "POST",
    headers: { authorization: String(req.headers.authorization ?? "") },
  });
  if (!authorizeInternalApi(pseudoRequest)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const body = (typeof req.body === "object" && req.body ? req.body : {}) as {
      creatorWallet?: string;
      creatorChain?: "sol" | "evm";
      shareAtomic?: string;
    };
    const creatorWallet = String(body.creatorWallet ?? "").trim();
    const creatorChain = body.creatorChain;
    const shareAtomic = String(body.shareAtomic ?? "").trim();

    if (!creatorWallet || (creatorChain !== "sol" && creatorChain !== "evm") || !shareAtomic) {
      res.status(400).json({ error: "Invalid payout body" });
      return;
    }

    const { disburseCreatorInstantShare } = await import("../concierge-api/creator-instant-payout");
    const payout: CreatorPayoutResult = await disburseCreatorInstantShare({
      creatorWallet,
      creatorChain,
      shareAtomic,
    });

    res.status(200).json({ ok: true, payout });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lounge-creator-payout]", e instanceof Error ? e.stack || msg : msg);
    res.status(500).json({ error: msg.slice(0, 200) || "Payout failed" });
  }
}
