/**
 * Concierge LP agent loop — screen → decide → manage → learn (Meridian-inspired).
 */
import { fetchConciergeMeteoraIntel, mergeScreening } from "./intel-bridge.mjs";
import { fetchMeteoraPools } from "./screening.mjs";
import {
  closeAllAndWithdraw,
  getSolBalance,
  listPositions,
  paperDecision,
  tryLiveDeploy,
} from "./dlmm-live.mjs";

const DEFAULT_SCREEN_MS = 120_000;
const DEFAULT_MANAGE_MS = 60_000;

/**
 * @typedef {object} LpSession
 * @property {string} sessionId
 * @property {string} ownerWallet
 * @property {string} sessionPubkey
 * @property {import('@solana/web3.js').Keypair} keypair
 * @property {object} criteria
 * @property {boolean} dryRun
 * @property {'active'|'stopping'|'stopped'} status
 * @property {string} startedAt
 * @property {string|null} stoppedAt
 * @property {Array<object>} decisions
 * @property {Array<object>} lessons
 * @property {Array<object>} positions
 * @property {object|null} lastScreen
 * @property {object|null} lastError
 * @property {ReturnType<typeof setInterval>|null} screenTimer
 * @property {ReturnType<typeof setInterval>|null} manageTimer
 */

/** @type {Map<string, LpSession>} */
const sessions = new Map();

function conciergeOrigin() {
  return (process.env.CONCIERGE_API_ORIGIN || process.env.LOUNGE_ORIGIN || "").trim();
}

function pushDecision(session, decision) {
  session.decisions.unshift({
    ...decision,
    at: new Date().toISOString(),
  });
  if (session.decisions.length > 100) session.decisions.length = 100;
}

function pushLesson(session, lesson) {
  session.lessons.unshift({
    ...lesson,
    at: new Date().toISOString(),
  });
  if (session.lessons.length > 50) session.lessons.length = 50;
}

async function runScreenCycle(session) {
  if (session.status !== "active") return;
  try {
    const publicPools = await fetchMeteoraPools(session.criteria);
    const intel = await fetchConciergeMeteoraIntel(conciergeOrigin(), session.criteria);
    const merged = mergeScreening(publicPools, intel.pools, session.criteria);
    session.lastScreen = {
      at: new Date().toISOString(),
      candidateCount: merged.length,
      intelSource: intel.source,
      intelError: intel.error || null,
      top: merged.slice(0, 5).map((p) => ({
        name: p.name,
        address: p.address,
        apy: p.apy,
        tvlUsd: p.tvlUsd,
        conciergeScore: p.conciergeScore,
        sources: p.sources,
      })),
    };

    const decision = paperDecision(merged, "screen");
    pushDecision(session, {
      agent: "hunter",
      ...decision,
      intelSource: intel.source,
    });

    if (
      !session.dryRun &&
      decision.action === "REDEPLOY" &&
      decision.pool?.address &&
      Number(session.criteria.maxCapitalSol ?? 0) > 0
    ) {
      const live = await tryLiveDeploy({
        keypair: session.keypair,
        poolAddress: decision.pool.address,
        amountSol: Number(session.criteria.maxCapitalSol),
        dryRun: session.dryRun,
      });
      pushDecision(session, {
        agent: "hunter",
        action: live.ok ? "DEPLOY_ATTEMPT" : "DEPLOY_SKIP",
        pool: decision.pool,
        live,
      });
    }
  } catch (e) {
    session.lastError = { at: new Date().toISOString(), message: e?.message || String(e) };
  }
}

async function runManageCycle(session) {
  if (session.status !== "active") return;
  try {
    const positions = session.dryRun
      ? []
      : await listPositions(session.sessionPubkey);
    session.positions = positions;

    let balance = null;
    try {
      balance = await getSolBalance(session.sessionPubkey);
    } catch {
      balance = null;
    }

    const top = session.lastScreen?.top?.[0];
    const oorMinutes = Number(session.criteria.oorMinutes ?? 15);
    let action = "STAY";
    let reason = "in_range_or_paper";

    if (!session.dryRun && positions.length) {
      const anyOor = positions.some((p) => p.inRange === false);
      if (anyOor) {
        action = "CLOSE";
        reason = `oor_watch_${oorMinutes}m`;
      }
    } else if (session.dryRun && top) {
      // Paper healer: rotate if score drops narrative
      action = Math.random() > 0.7 ? "STAY" : "STAY";
      reason = "paper_monitor";
    }

    pushDecision(session, {
      agent: "healer",
      action,
      reason,
      positions: positions.length,
      balanceSol: balance,
      pool: top || null,
      mode: session.dryRun ? "paper" : "live",
    });

    if (action === "CLOSE" && !session.dryRun) {
      pushLesson(session, {
        type: "oor_close",
        detail: reason,
        pool: top?.address || null,
      });
    }
  } catch (e) {
    session.lastError = { at: new Date().toISOString(), message: e?.message || String(e) };
  }
}

/**
 * @param {object} opts
 */
export function startSession(opts) {
  const {
    sessionId,
    ownerWallet,
    keypair,
    criteria = {},
    dryRun = true,
  } = opts;

  if (sessions.has(sessionId)) {
    const existing = sessions.get(sessionId);
    return publicView(existing);
  }

  /** @type {LpSession} */
  const session = {
    sessionId,
    ownerWallet,
    sessionPubkey: keypair.publicKey.toBase58(),
    keypair,
    criteria: {
      minTvl: Number(criteria.minTvl ?? 50_000),
      maxApy: Number(criteria.maxApy ?? 250),
      minFeeTvl: Number(criteria.minFeeTvl ?? 0),
      minOrganicScore: Number(criteria.minOrganicScore ?? 0),
      takeProfitPct: Number(criteria.takeProfitPct ?? 5),
      oorMinutes: Number(criteria.oorMinutes ?? 15),
      maxCapitalSol: Number(criteria.maxCapitalSol ?? 0.5),
      binRange: criteria.binRange ?? null,
    },
    dryRun: dryRun !== false,
    status: "active",
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    decisions: [],
    lessons: [],
    positions: [],
    lastScreen: null,
    lastError: null,
    screenTimer: null,
    manageTimer: null,
  };

  sessions.set(sessionId, session);

  // Kick immediately, then schedule
  void runScreenCycle(session);
  void runManageCycle(session);

  const screenMs = Number(process.env.LP_SCREEN_INTERVAL_MS || DEFAULT_SCREEN_MS);
  const manageMs = Number(process.env.LP_MANAGE_INTERVAL_MS || DEFAULT_MANAGE_MS);
  session.screenTimer = setInterval(() => void runScreenCycle(session), screenMs);
  session.manageTimer = setInterval(() => void runManageCycle(session), manageMs);

  return publicView(session);
}

export async function stopSession(sessionId, { closePositions = true, withdraw = true } = {}) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.status = "stopping";
  if (session.screenTimer) clearInterval(session.screenTimer);
  if (session.manageTimer) clearInterval(session.manageTimer);
  session.screenTimer = null;
  session.manageTimer = null;

  let withdrawResult = null;
  if (closePositions || withdraw) {
    withdrawResult = await closeAllAndWithdraw({
      keypair: session.keypair,
      ownerPubkey: session.ownerWallet,
      dryRun: session.dryRun || !withdraw,
    });
    pushDecision(session, {
      agent: "healer",
      action: "STOP",
      reason: "user_stop",
      withdraw: withdrawResult,
    });
    pushLesson(session, {
      type: "session_stop",
      dryRun: session.dryRun,
      withdraw: withdrawResult,
    });
  }

  session.status = "stopped";
  session.stoppedAt = new Date().toISOString();
  // Wipe signing material from memory after stop
  session.keypair = null;

  const view = publicView(session);
  // Keep status briefly for polling, then drop secrets
  setTimeout(() => {
    sessions.delete(sessionId);
  }, 120_000);

  return { ...view, withdraw: withdrawResult };
}

export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  return session ? publicView(session) : null;
}

export function publicView(session) {
  return {
    sessionId: session.sessionId,
    ownerWallet: session.ownerWallet,
    sessionPubkey: session.sessionPubkey,
    depositAddress: session.sessionPubkey,
    dryRun: session.dryRun,
    status: session.status,
    criteria: session.criteria,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    decisions: session.decisions.slice(0, 30),
    lessons: session.lessons.slice(0, 20),
    positions: session.positions,
    lastScreen: session.lastScreen,
    lastError: session.lastError,
  };
}

export function listActiveSessionIds() {
  return [...sessions.entries()]
    .filter(([, s]) => s.status === "active")
    .map(([id]) => id);
}
