const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaMint(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim();
  return MINT_RE.test(s);
}

export function normalizeSolanaMint(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return MINT_RE.test(s) ? s : null;
}
