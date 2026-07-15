import type { CatalogEntry, ResourceKind } from "./catalog.js";
import type { PaymentRequiredPayload, X402Accept } from "./payment.js";

export type ConciergeAgentOptions = {
  /** API origin — default https://conc-exe.xyz */
  origin?: string;
  fetch?: typeof fetch;
  /** Pre-settled x402 PAYMENT-SIGNATURE header */
  paymentSignature?: string;
  /** Solana wallet for TCX prepaid credits */
  creditsWallet?: string;
  /** Optional agent identity header (agt_…) */
  agentId?: string;
  /**
   * Called when the server returns HTTP 402.
   * Return a PAYMENT-SIGNATURE string to retry once automatically.
   */
  settlePayment?: (ctx: SettleContext) => Promise<string>;
};

export type SettleContext = {
  kind: ResourceKind | string;
  url: string;
  paymentRequiredHeader: string;
  accepts: X402Accept[];
  payload: PaymentRequiredPayload;
  priceUsd?: string;
};

export type CallResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: T;
  paymentRequired?: string;
  paymentRequiredPayload?: PaymentRequiredPayload | null;
  headers: Headers;
};

export type DiscoverySnapshot = {
  origin: string;
  serviceName?: string;
  description?: string;
  resourceUrls: string[];
  catalog: CatalogEntry[];
  links: Record<string, unknown>;
  openapi?: Record<string, unknown>;
  agentCard?: Record<string, unknown>;
  a2aMesh?: Record<string, unknown>;
  mcpUrl: string;
};

export class PaymentRequiredError extends Error {
  readonly status = 402;
  readonly kind: string;
  readonly url: string;
  readonly paymentRequired: string;
  readonly accepts: X402Accept[];
  readonly payload: PaymentRequiredPayload | null;
  readonly body: unknown;

  constructor(input: {
    kind: string;
    url: string;
    paymentRequired: string;
    accepts: X402Accept[];
    payload: PaymentRequiredPayload | null;
    body: unknown;
  }) {
    super(`Payment required for ${input.kind} (${input.url})`);
    this.name = "PaymentRequiredError";
    this.kind = input.kind;
    this.url = input.url;
    this.paymentRequired = input.paymentRequired;
    this.accepts = input.accepts;
    this.payload = input.payload;
    this.body = input.body;
  }
}

export class ConciergeAgentError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ConciergeAgentError";
    this.status = status;
    this.body = body;
  }
}
