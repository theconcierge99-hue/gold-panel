import { categorizeHeadline, headlineScore, timeAgoLabel, type UiHeadline } from "./headline-ui";
import type { CreatorSignal } from "./signals-types";

const CREATOR_SOURCE = "Lounge Signal";

export function creatorSignalToUiHeadline(signal: CreatorSignal): UiHeadline & {
  signalId: string;
  kind: "creator";
  creatorWallet: string;
  rwaTokenId?: string;
} {
  const primaryCat = signal.categories[0] ?? "Markets";
  const { label, color } = categorizeHeadline(`${signal.title} ${primaryCat}`, CREATOR_SOURCE);
  const category = signal.categories.includes(label) ? label : primaryCat;
  const categoryColor = color;

  return {
    source: CREATOR_SOURCE,
    title: signal.title,
    published: signal.publishedAt,
    url: undefined,
    summary: signal.summary.slice(0, 280) + (signal.summary.length > 280 ? "…" : ""),
    category,
    categoryColor,
    ageLabel: timeAgoLabel(signal.publishedAt),
    score: headlineScore(signal.title, signal.creatorWallet),
    signalId: signal.id,
    kind: "creator",
    creatorWallet: signal.creatorWallet,
    rwaTokenId: signal.rwaTokenId,
  };
}

export async function listCreatorHeadlinesForUi(): Promise<
  (UiHeadline & { signalId: string; kind: "creator"; creatorWallet: string; rwaTokenId?: string })[]
> {
  const { listPublishedSignals } = await import("./signal-store");
  const signals = await listPublishedSignals(24);
  return signals.map(creatorSignalToUiHeadline);
}
