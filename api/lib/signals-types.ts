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
};

export type SignalLedgerEntry = {
  type: "signal_unlock";
  signalId: string;
  creatorWallet: string;
  payer: string;
  /** Gross reader unlock (0.1 USDC) */
  amountAtomic: string;
  /** Creator 50% of reader unlock */
  creatorShareAtomic: string;
  /** Merchant 50% of reader unlock */
  merchantShareAtomic: string;
  /** On-chain USDC transfer to creator wallet (when payout wallet configured) */
  creatorPayoutTx?: string;
  creatorPayoutStatus?: "sent" | "skipped" | "failed";
  creatorShareBps: number;
  merchantShareBps: number;
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
