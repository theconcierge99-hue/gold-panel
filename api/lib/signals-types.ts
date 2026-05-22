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
  amountAtomic: string;
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
