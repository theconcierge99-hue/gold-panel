/**
 * x402 facilitator profiles — PayAI, Dexter, CDP Bazaar, and Robinhood (Primer/Naven).
 * @see https://docs.dexter.cash/docs/facilitator-and-chains/
 * @see https://docs.payai.network/x402/facilitators/pricing
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 * @see https://docs.primer.systems/facilitator.html
 */

export type X402FacilitatorId = "cdp" | "dexter" | "payai" | "robinhood";

export type X402FacilitatorProfile = {
  id: X402FacilitatorId;
  name: string;
  url: string;
  solanaFeePayer: string;
  docsUrl: string;
  marketplaceUrl: string;
  sellersUrl: string;
};

/** Default Robinhood Chain facilitator (USDG on eip155:4663). Override with X402_ROBINHOOD_FACILITATOR_URL. */
export const PRIMER_ROBINHOOD_FACILITATOR_URL = "https://x402.primer.systems";
export const NAVEN_ROBINHOOD_FACILITATOR_URL = "https://facilitator.naven.network";

export const PAYAI_FACILITATOR: X402FacilitatorProfile = {
  id: "payai",
  name: "PayAI",
  url: "https://facilitator.payai.network",
  solanaFeePayer: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
  docsUrl: "https://docs.payai.network/x402/facilitators/pricing",
  marketplaceUrl: "https://www.x402scan.com/",
  sellersUrl: "https://www.x402scan.com/resources/register",
};

export const DEXTER_FACILITATOR: X402FacilitatorProfile = {
  id: "dexter",
  name: "Dexter",
  url: "https://x402.dexter.cash",
  solanaFeePayer: "DeXterR2kQm8AvRHnNPatWkE46TfAcMeBDjb6FySoAb8",
  docsUrl: "https://docs.dexter.cash/docs/facilitator-and-chains/",
  marketplaceUrl: "https://dexter.cash/opendexter",
  sellersUrl: "https://dexter.cash/sellers",
};

export const CDP_FACILITATOR: X402FacilitatorProfile = {
  id: "cdp",
  name: "Coinbase CDP",
  url: "https://api.cdp.coinbase.com/platform/v2/x402",
  // Solana requirements remain bound to the advertised PayAI/Dexter fee payer.
  solanaFeePayer: "",
  docsUrl: "https://docs.cdp.coinbase.com/x402/bazaar",
  marketplaceUrl: "https://agentic.market/",
  sellersUrl: "https://docs.cdp.coinbase.com/x402/bazaar",
};

/** Robinhood Chain USDG rail — separate from PayAI/CDP (they do not settle eip155:4663). */
export function getRobinhoodFacilitatorProfile(): X402FacilitatorProfile {
  const raw = (process.env.X402_ROBINHOOD_FACILITATOR_URL || PRIMER_ROBINHOOD_FACILITATOR_URL)
    .trim()
    .replace(/\/$/, "");
  const isNaven = /naven\.network/i.test(raw);
  return {
    id: "robinhood",
    name: isNaven ? "Naven (Robinhood)" : "Primer (Robinhood)",
    url: raw || PRIMER_ROBINHOOD_FACILITATOR_URL,
    solanaFeePayer: "",
    docsUrl: isNaven
      ? "https://naven.network/docs/demo/robinhood-x402"
      : "https://docs.primer.systems/facilitator.html",
    marketplaceUrl: "https://agent402.tools/robinhood",
    sellersUrl: "https://docs.robinhood.com/chain/",
  };
}

/** Primary facilitator — default PayAI. Set X402_FACILITATOR=dexter|cdp to swap primary. */
export function getX402FacilitatorProfile(): X402FacilitatorProfile {
  const raw = (process.env.X402_FACILITATOR || "payai").trim().toLowerCase();
  if (raw === "cdp") return CDP_FACILITATOR;
  if (raw === "dexter") return DEXTER_FACILITATOR;
  return PAYAI_FACILITATOR;
}

/** Secondary facilitator when primary verify/settle is unavailable (EVM) or listed in 402 accepts (Solana). */
export function getX402FacilitatorFallback(): X402FacilitatorProfile {
  return getX402FacilitatorProfile().id === "payai" ? DEXTER_FACILITATOR : PAYAI_FACILITATOR;
}

export function getSolanaFeePayer(): string {
  return getX402FacilitatorProfile().solanaFeePayer;
}

export function resolveFacilitatorForSolanaFeePayer(feePayer: string): X402FacilitatorProfile {
  if (feePayer === DEXTER_FACILITATOR.solanaFeePayer) return DEXTER_FACILITATOR;
  if (feePayer === PAYAI_FACILITATOR.solanaFeePayer) return PAYAI_FACILITATOR;
  return getX402FacilitatorProfile();
}

/** AgentCash / MPPscan dual-protocol payment metadata (PayAI primary, Dexter fallback). */
export function mppPaymentProtocols(opts?: { robinhood?: boolean }): Record<string, unknown>[] {
  const primary = getX402FacilitatorProfile();
  const fallback = getX402FacilitatorFallback();
  const protocols: Record<string, unknown>[] = [
    { x402: { network: "base", facilitator: primary.url, role: "primary" } },
    { x402: { network: "arbitrum", facilitator: primary.url, role: "primary" } },
    { x402: { network: "base", facilitator: fallback.url, role: "fallback" } },
    { x402: { network: "arbitrum", facilitator: fallback.url, role: "fallback" } },
  ];
  if (primary.id !== "cdp") {
    protocols.unshift({ x402: { network: "solana", facilitator: primary.url, role: "primary" } });
  }
  if (fallback.id !== "cdp") {
    protocols.push({ x402: { network: "solana", facilitator: fallback.url, role: "fallback" } });
  }
  if (opts?.robinhood) {
    const rh = getRobinhoodFacilitatorProfile();
    protocols.push({
      x402: {
        network: "robinhood",
        caip2: "eip155:4663",
        asset: "USDG",
        facilitator: rh.url,
        role: "primary",
      },
    });
    protocols.push({ mpp: { method: "eip155", network: "robinhood", intent: "charge", currency: "USDG" } });
  }
  protocols.push(
    { mpp: { method: "solana", intent: "charge", currency: "USDC" } },
  );
  return protocols;
}
