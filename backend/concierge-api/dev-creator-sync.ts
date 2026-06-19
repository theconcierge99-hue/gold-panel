/**
 * Dev-only: hydrate creator signals from production when local KV is not configured.
 * Wire headlines stay local (fresh RSS); only creatorHeadlines are synced.
 */
import { isProduction } from "./concierge-security";
import { signalStoreMode } from "./signal-store";
import type { listCreatorHeadlinesForUi } from "./signal-ui";

type CreatorUiHeadline = Awaited<ReturnType<typeof listCreatorHeadlinesForUi>>[number];

const DEFAULT_ORIGIN = "https://conc-exe.xyz";
const DEV_ORIGIN = "http://localhost:8080";

function devCreatorSyncEnabled(): boolean {
  if (isProduction()) return false;
  if (signalStoreMode() === "redis") return false;
  const raw = (process.env.DEV_CREATOR_SYNC ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no";
}

function productionOrigin(): string {
  return (process.env.DEV_CREATOR_SYNC_ORIGIN ?? process.env.X402_SITE_ORIGIN ?? DEFAULT_ORIGIN).replace(
    /\/$/,
    "",
  );
}

function isCreatorRow(row: unknown): row is CreatorUiHeadline {
  if (!row || typeof row !== "object") return false;
  const h = row as Record<string, unknown>;
  return typeof h.title === "string" && (h.kind === "creator" || typeof h.signalId === "string");
}

/** Pull creatorHeadlines from production /api/market (localhost Origin is allowlisted). */
export async function fetchDevCreatorHeadlines(limit = 24): Promise<CreatorUiHeadline[]> {
  if (!devCreatorSyncEnabled()) return [];

  const origin = productionOrigin();
  const res = await fetch(`${origin}/api/market`, {
    headers: {
      Accept: "application/json",
      Origin: DEV_ORIGIN,
    },
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const fromField = Array.isArray(data.creatorHeadlines) ? data.creatorHeadlines : null;
  const fromMerged = Array.isArray(data.headlines)
    ? data.headlines.filter(isCreatorRow)
    : [];

  const rows = (fromField ?? fromMerged).filter(isCreatorRow);
  return rows.slice(0, limit);
}
