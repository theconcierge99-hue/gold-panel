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
  /** Creator 80% of reader unlock */
  creatorShareAtomic: string;
  /** Merchant 20% of reader unlock */
  merchantShareAtomic: string;
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
