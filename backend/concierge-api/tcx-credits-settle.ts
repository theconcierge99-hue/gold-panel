/**
 * TCX prepaid credits — settle eligible routes before x402 when wallet header is present.
 */
import {
  creditsCostForResource,
  isMvpResourceKind,
  type X402ResourceKind,
} from "./x402-pricing";
import {
  deductTcxCredits,
  tcxCreditsEnabled,
  walletFromCreditsHeader,
} from "./tcx-credits-store";

export type TcxCreditsSettleResult =
  | { ok: true; wallet: string; creditsSpent: number; balanceRemaining: number }
  | { ok: false; reason: string };

export async function tryTcxCreditsSettlement(
  request: Request,
  kind: X402ResourceKind,
): Promise<TcxCreditsSettleResult> {
  if (!tcxCreditsEnabled() || !isMvpResourceKind(kind)) {
    return { ok: false, reason: "not_applicable" };
  }

  const wallet = walletFromCreditsHeader(request);
  if (!wallet) return { ok: false, reason: "wallet_header_required" };

  const cost = creditsCostForResource(kind);
  const result = await deductTcxCredits(wallet, cost);
  if (!result.ok) return { ok: false, reason: result.reason };

  return {
    ok: true,
    wallet,
    creditsSpent: cost,
    balanceRemaining: result.profile.balanceCredits,
  };
}
