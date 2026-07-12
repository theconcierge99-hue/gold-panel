/**
 * Weekly TCX ledger tx hashes — repo JSON (config/launch/tcx-week-ledger.json).
 * Ops pastes Solscan signatures in chat; agent edits the file and deploys.
 */
import ledgerFile from "../../config/launch/tcx-week-ledger.json";

export type TcxWeekLedgerTx = {
  netUsdcTx?: string;
  buybackTx?: string;
  tcxBurnTx?: string;
  lpTx?: string;
};

type LedgerFile = {
  weeks?: Record<string, TcxWeekLedgerTx>;
};

const ledgerWeeks = (): Record<string, TcxWeekLedgerTx> => {
  const file = ledgerFile as LedgerFile;
  return file.weeks ?? {};
};

export async function listTcxWeekLedgerTx(weekEnds: string[]): Promise<Map<string, TcxWeekLedgerTx>> {
  const source = ledgerWeeks();
  const out = new Map<string, TcxWeekLedgerTx>();
  for (const weekEnd of weekEnds) {
    const row = source[weekEnd];
    if (row && (row.netUsdcTx || row.buybackTx || row.tcxBurnTx || row.lpTx)) {
      out.set(weekEnd, { ...row });
    }
  }
  return out;
}

/** Optional env fallback for in-progress week when JSON row is empty. */
export function legacyEnvLedgerForActiveWeek(): TcxWeekLedgerTx {
  const burn = (process.env.TCX_TRANSPARENCY_BURN_TX ?? "").trim();
  const lp = (process.env.TCX_TRANSPARENCY_LP_TX ?? "").trim();
  const out: TcxWeekLedgerTx = {};
  if (burn) out.tcxBurnTx = burn;
  if (lp) out.lpTx = lp;
  return out;
}

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}
