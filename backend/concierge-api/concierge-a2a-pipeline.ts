/**
 * A2A orchestration pipeline — desk brief + machine handoff + delegate routing.
 */
import {
  A2A_HANDOFF_SCHEMA,
  buildA2aHandoffLine,
  suggestDelegateSteps,
} from "./a2a-mesh";
import { runDeskBriefIntel } from "./concierge-desk-brief";
import type { DeskVerdict } from "./concierge-defi-intel";
import { listAgents, toPublicView } from "./agent-identity-store";
import type { IntelRequestBody } from "./concierge-intel-handler";

export async function runA2aPipelineIntel(
  body: IntelRequestBody,
  origin: string,
): Promise<Record<string, unknown>> {
  const brief = await runDeskBriefIntel(body);
  const briefBlock = brief.brief as { verdict?: DeskVerdict } | undefined;
  const verdict =
    briefBlock?.verdict ??
    (brief.components as { verdict?: DeskVerdict } | undefined)?.verdict;
  if (!verdict) throw new Error("Pipeline could not build desk verdict");

  const base = origin.replace(/\/$/, "");
  const agents = await listAgents(12);
  const publicAgents = agents.map((a) => toPublicView(base, a));
  const handoff = buildA2aHandoffLine(verdict);
  const delegate = suggestDelegateSteps(verdict, base, publicAgents);

  return {
    ...brief,
    kind: "intel-a2a-pipeline",
    a2a: {
      schema: A2A_HANDOFF_SCHEMA,
      handoff,
      parsed: {
        asset: "BTC",
        class: "crypto",
        timeframe: "24h",
        bias: handoff.match(/bias=([^|]+)/)?.[1] ?? "neutral",
        conviction: handoff.match(/conviction=([^|]+)/)?.[1] ?? "M",
        signal: verdict.signal,
        confidence: verdict.confidence,
      },
      pipeline: {
        executed: ["intel-macro", "intel-meteora", "intel-verdict"],
        settlement: "single x402 payment — internal steps are not billed separately",
      },
      delegate,
      mesh: `${base}/api/agent-a2a-mesh`,
      peerCount: publicAgents.length,
    },
  };
}
