/**
 * x402 facilitator profiles — PayAI (primary) and Dexter (fallback).
 * @see https://docs.dexter.cash/docs/facilitator-and-chains/
 * @see https://docs.payai.network/x402/facilitators/pricing
 */

export type X402FacilitatorId = "dexter" | "payai";

export type X402FacilitatorProfile = {
  id: X402FacilitatorId;
  name: string;
  url: string;
  solanaFeePayer: string;
  docsUrl: string;
  marketplaceUrl: string;
  sellersUrl: string;
};

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

/** Primary facilitator — default PayAI. Set X402_FACILITATOR=dexter to swap primary. */
export function getX402FacilitatorProfile(): X402FacilitatorProfile {
  const raw = (process.env.X402_FACILITATOR || "payai").trim().toLowerCase();
  return raw === "dexter" ? DEXTER_FACILITATOR : PAYAI_FACILITATOR;
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
export function mppPaymentProtocols(): Record<string, unknown>[] {
  const primary = getX402FacilitatorProfile();
  const fallback = getX402FacilitatorFallback();
  return [
    { x402: { network: "solana", facilitator: primary.url, role: "primary" } },
    { x402: { network: "base", facilitator: primary.url, role: "primary" } },
    { x402: { network: "solana", facilitator: fallback.url, role: "fallback" } },
    { x402: { network: "base", facilitator: fallback.url, role: "fallback" } },
    { mpp: { method: "solana", intent: "charge", currency: "USDC" } },
  ];
}
