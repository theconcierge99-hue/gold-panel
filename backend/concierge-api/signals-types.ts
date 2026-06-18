export type CreatorSignal = {
  id: string;
  title: string;
  summary: string;
  categories: string[];
  creatorWallet: string;
  creatorChain: "sol" | "evm";
  publishedAt: string;
  publishTx?: string;
  publishPayer?: string;
  /** RWA certificate id (minted at publish) */
  rwaTokenId?: string;
};

export type SignalLedgerEntry = {
  type: "signal_unlock";
  signalId: string;
  creatorWallet: string;
  payer: string;
  /** Gross reader unlock (0.1 USDC) */
  amountAtomic: string;
  /** Legacy split fields — creator share is 0; creators earn Lounge points instead */
  creatorShareAtomic: string;
  merchantShareAtomic: string;
  creatorShareBps: number;
  merchantShareBps: number;
  /** Points awarded to creator on this unlock (when credited) */
  creatorPointsAwarded?: number;
  transaction: string;
  at: string;
};

export type SignalPublishBody = {
  title: string;
  summary: string;
  categories: string[];
  creatorWallet: string;
  creatorChain: "sol" | "evm";
};

export type SignalOpenBody = {
  signalId: string;
};
