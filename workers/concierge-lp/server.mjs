/**
 * Concierge LP worker HTTP control plane.
 *
 * Env:
 *   PORT=8790
 *   WORKER_SECRET=same as CONCIERGE_LP_WORKER_SECRET
 *   DRY_RUN=true (default paper unless session overrides)
 *   CONCIERGE_API_ORIGIN=https://conc-exe.xyz
 *   SOLANA_RPC_URL=...
 */
import { createServer } from "node:http";
import { createSessionKeypair, exportSecret } from "./agent/dlmm-live.mjs";
import { getSession, listActiveSessionIds, startSession, stopSession } from "./agent/loop.mjs";

const PORT = Number(process.env.PORT || 8790);
const SECRET = (process.env.WORKER_SECRET || process.env.CONCIERGE_LP_WORKER_SECRET || "").trim();
const DEFAULT_DRY = process.env.DRY_RUN !== "false";

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 256_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function authOk(req) {
  if (!SECRET) return true;
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const hdr = String(req.headers["x-concierge-worker-secret"] || "").trim();
  return bearer === SECRET || hdr === SECRET;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "concierge-lp",
      activeSessions: listActiveSessionIds().length,
      defaultDryRun: DEFAULT_DRY,
    });
  }

  if (!authOk(req)) {
    return json(res, 401, { error: "unauthorized" });
  }

  try {
    if (req.method === "GET" && url.pathname === "/session/status") {
      const sessionId = url.searchParams.get("sessionId") || "";
      const view = getSession(sessionId);
      if (!view) return json(res, 404, { error: "session_not_found" });
      return json(res, 200, view);
    }

    if (req.method === "POST" && url.pathname === "/session/start") {
      const body = await readBody(req);
      const sessionId = String(body.sessionId || "").trim();
      const ownerWallet = String(body.ownerWallet || "").trim();
      if (!sessionId || !ownerWallet) {
        return json(res, 400, { error: "sessionId_and_ownerWallet_required" });
      }
      const existing = getSession(sessionId);
      if (existing) return json(res, 200, existing);

      const keypair = createSessionKeypair();
      const dryRun = body.dryRun === false ? false : body.dryRun === true ? true : DEFAULT_DRY;
      const view = startSession({
        sessionId,
        ownerWallet,
        keypair,
        criteria: body.criteria || {},
        dryRun,
      });

      return json(res, 201, {
        ...view,
        // Secret only returned once over TLS to Concierge API for optional encrypted backup
        sessionSecret: exportSecret(keypair),
      });
    }

    if (req.method === "POST" && url.pathname === "/session/stop") {
      const body = await readBody(req);
      const sessionId = String(body.sessionId || "").trim();
      if (!sessionId) return json(res, 400, { error: "sessionId_required" });
      const view = await stopSession(sessionId, {
        closePositions: body.closePositions !== false,
        withdraw: body.withdraw !== false,
      });
      if (!view) return json(res, 404, { error: "session_not_found" });
      return json(res, 200, view);
    }

    return json(res, 404, { error: "not_found" });
  } catch (e) {
    return json(res, 500, { error: e?.message || "internal_error" });
  }
});

server.listen(PORT, () => {
  console.log(`[concierge-lp] listening on :${PORT} dryDefault=${DEFAULT_DRY}`);
});
