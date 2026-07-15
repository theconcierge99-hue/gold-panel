/**
 * @conc-exe/agent — discover Concierge pay-per-call APIs and call them with x402 / TCX.
 */

export {
  CATALOG,
  DEFAULT_ORIGIN,
  getCatalogEntry,
  payCurlHint,
  resourceUrl,
  type CatalogEntry,
  type ResourceKind,
} from "./catalog.js";

export {
  b64DecodeJson,
  b64EncodeJson,
  parsePaymentRequired,
  type PaymentRequiredPayload,
  type X402Accept,
} from "./payment.js";

export {
  ConciergeAgentError,
  PaymentRequiredError,
  type CallResult,
  type ConciergeAgentOptions,
  type DiscoverySnapshot,
  type SettleContext,
} from "./types.js";

export { ConciergeAgentClient, createConciergeAgent } from "./client.js";
