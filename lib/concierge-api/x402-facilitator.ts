/**
 * x402 facilitator profiles — PayAI (legacy) and Dexter (default).
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

const PAYAI: X402FacilitatorProfile = {
  id: "payai",
  name: "PayAI",
  url: "https://facilitator.payai.network",
  solanaFeePayer: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
  docsUrl: "https://docs.payai.network/x402/facilitators/pricing",
  marketplaceUrl: "https://www.x402scan.com/",
  sellersUrl: "https://www.x402scan.com/resources/register",
};

const DEXTER: X402FacilitatorProfile = {
  id: "dexter",
  name: "Dexter",
  url: "https://x402.dexter.cash",
  solanaFeePayer: "DeXterR2kQm8AvRHnNPatWkE46TfAcMeBDjb6FySoAb8",
  docsUrl: "https://docs.dexter.cash/docs/facilitator-and-chains/",
  marketplaceUrl: "https://dexter.cash/opendexter",
  sellersUrl: "https://dexter.cash/sellers",
};

/** Active facilitator — set X402_FACILITATOR=payai to revert to PayAI. */
export function getX402FacilitatorProfile(): X402FacilitatorProfile {
  const raw = (process.env.X402_FACILITATOR || "dexter").trim().toLowerCase();
  return raw === "payai" ? PAYAI : DEXTER;
}

export function getSolanaFeePayer(): string {
  return getX402FacilitatorProfile().solanaFeePayer;
}

/** AgentCash / MPPscan dual-protocol payment metadata. */
export function mppPaymentProtocols(facilitatorUrl: string): Record<string, unknown>[] {
  return [
    { x402: { network: "solana", facilitator: facilitatorUrl } },
    { x402: { network: "base", facilitator: facilitatorUrl } },
    { mpp: { method: "solana", intent: "charge", currency: "USDC" } },
  ];
}
