/**
 * Weekly TCX ledger tx hashes — repo JSON (config/launch/tcx-week-ledger.json).
 * Ops pastes Solscan signatures in chat; agent edits the file and deploys.
 * `tcxBurnTx` may be one signature or an array when multiple burns settle the same week.
 */
import ledgerFile from "../../config/launch/tcx-week-ledger.json";

export type TcxWeekLedgerTx = {
  netUsdcTx?: string;
  buybackTx?: string;
  /** One burn, or several burns for the same week (amounts are summed). */
  tcxBurnTx?: string | string[];
  lpTx?: string;
};

type LedgerFile = {
  weeks?: Record<string, TcxWeekLedgerTx>;
};

const ledgerWeeks = (): Record<string, TcxWeekLedgerTx> => {
  const file = ledgerFile as LedgerFile;
  return file.weeks ?? {};
};

export function tcxBurnSignatures(tcxBurnTx?: string | string[]): string[] {
  if (!tcxBurnTx) return [];
  const raw = Array.isArray(tcxBurnTx) ? tcxBurnTx : [tcxBurnTx];
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}

function rowHasTx(row: TcxWeekLedgerTx): boolean {
  return Boolean(
    row.netUsdcTx || row.buybackTx || tcxBurnSignatures(row.tcxBurnTx).length || row.lpTx,
  );
}

/** Repo JSON only — no env fallback. */
export async function listTcxWeekLedgerTx(weekEnds: string[]): Promise<Map<string, TcxWeekLedgerTx>> {
  const source = ledgerWeeks();
  const out = new Map<string, TcxWeekLedgerTx>();
  for (const weekEnd of weekEnds) {
    const row = source[weekEnd];
    if (row && rowHasTx(row)) {
      out.set(weekEnd, { ...row });
    }
  }
  return out;
}

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}
