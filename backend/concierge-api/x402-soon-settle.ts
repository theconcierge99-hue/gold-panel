/** @deprecated Use `token-pay/self-settle` — type aliases for SOON-era imports. */
import {
  isTokenPaySelfSettleRequirement,
  verifyAndSettleTokenPaySelf,
} from "./token-pay/self-settle";
import type { TokenPayPaymentPayload, TokenPaySelfSettleRequirement } from "./token-pay/types";

export type SoonAcceptRequirement = TokenPaySelfSettleRequirement;
export type SoonPaymentPayload = TokenPayPaymentPayload;

export const isSelfSettleRequirement = isTokenPaySelfSettleRequirement;
export const verifyAndSettleSoonSelf = verifyAndSettleTokenPaySelf;
