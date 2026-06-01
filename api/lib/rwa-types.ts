/** RWA digital asset records — on-chain contract mint is a future step. */

export type RwaTargetChain = "sol" | "evm";

export type SignalRwaToken = {
  tokenId: string;
  signalId: string;
  standard: "concierge-lounge-rwa-v1";
  assetClass: "intelligence-signal";
  targetChain: RwaTargetChain;
  /** ERC-1155 or SPL metadata-ready */
  tokenStandard: "ERC-1155" | "SPL-Asset-Metadata";
  contractAddress?: string;
  onChainMintTx?: string;
  contentHash: string;
  metadata: {
    name: string;
    description: string;
    image: string;
    external_url: string;
    attributes: { trait_type: string; value: string }[];
  };
  issuerWallet: string;
  mintedAt: string;
  publishTx?: string;
};

export type ReaderBadge = {
  badgeId: string;
  wallet: string;
  walletChain: RwaTargetChain;
  signalId: string;
  signalTitle: string;
  badgeSlug: string;
  badgeLabel: string;
  tier: number;
  /** Cumulative unlock count for this wallet after this award */
  readerUnlockCount: number;
  unlockTx?: string;
  awardedAt: string;
};

export type ReaderBadgeTier = {
  slug: string;
  label: string;
  tier: number;
  minUnlocks: number;
};

export type ReaderBadgeProfile = {
  wallet: string;
  totalUnlocks: number;
  tier: ReaderBadgeTier;
  badges: ReaderBadge[];
};
