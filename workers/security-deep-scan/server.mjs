/**
 * Concierge Deep Scan worker — httpx + nuclei (optional binaries).
 *
 * Env:
 *   PORT=8787
 *   WORKER_SECRET=same as SECURITY_DEEP_SCAN_WORKER_SECRET
 *   NUCLEI_BIN=nuclei (optional)
 *   HTTPX_BIN=httpx (optional)
 *
 * Concierge sets SECURITY_DEEP_SCAN_WORKER_URL=http://host:8787
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const SECRET = (process.env.WORKER_SECRET || process.env.SECURITY_DEEP_SCAN_WORKER_SECRET || "").trim();
const NUCLEI = process.env.NUCLEI_BIN || "nuclei";
const HTTPX = process.env.HTTPX_BIN || "httpx";

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
      if (size > 64_000) {
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

function runCmd(bin, args, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr || "timeout", code: -1 });
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(t);
      resolve({ ok: false, stdout, stderr: err.message, code: -1 });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ ok: code === 0 || code === 1, stdout, stderr, code: code ?? -1 });
    });
  });
}

async function probeHttpx(target) {
  const out = await runCmd(HTTPX, ["-u", target, "-json", "-silent", "-tech-detect", "-title", "-status-code"], 45_000);
  if (!out.ok || !out.stdout.trim()) {
    return { status_code: null, title: null, tech: [], note: out.stderr || "httpx unavailable" };
  }
  try {
    const line = out.stdout.trim().split("\n").filter(Boolean).pop();
    return JSON.parse(line);
  } catch {
    return { status_code: null, title: null, tech: [], raw: out.stdout.slice(0, 500) };
  }
}

async function probeNuclei(target) {
  const dir = await mkdtemp(join(tmpdir(), "concierge-deep-"));
  const outFile = join(dir, "nuclei.jsonl");
  try {
    const args = [
      "-u",
      target,
      "-silent",
      "-jsonl",
      "-o",
      outFile,
      "-severity",
      "info,low,medium,high,critical",
      "-c",
      "25",
      "-timeout",
      "8",
    ];
    // Prefer passive / misconfig tags when nuclei supports -tags
    args.push("-tags", "misconfig,exposure,tech,http");
    const out = await runCmd(NUCLEI, args, 180_000);
    let text = "";
    try {
      text = await readFile(outFile, "utf8");
    } catch {
      text = out.stdout || "";
    }
    const rows = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (!rows.length && !out.ok) {
      return [
        {
          "template-id": "nuclei-unavailable",
          info: {
            name: "Template engine unavailable on worker",
            severity: "info",
            description: out.stderr?.slice(0, 400) || "Install nuclei on the worker host.",
            remediation: "Install ProjectDiscovery nuclei and ensure NUCLEI_BIN is on PATH.",
          },
          "matched-at": target,
        },
      ];
    }
    return rows;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function postComplete(completeUrl, secret, payload) {
  if (!completeUrl) return;
  await fetch(completeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret || SECRET}`,
      "X-Concierge-Worker-Secret": secret || SECRET,
    },
    body: JSON.stringify(payload),
  });
}

async function runJob(body) {
  const { jobId, target, completeUrl, secret, profile } = body;
  await postComplete(completeUrl, secret, {
    jobId,
    status: "running",
    progress: { phase: "httpx", percent: 15 },
  });
  const httpx = await probeHttpx(target);
  await postComplete(completeUrl, secret, {
    jobId,
    status: "running",
    progress: { phase: "templates", percent: 45 },
  });
  const nuclei = await probeNuclei(target);
  await postComplete(completeUrl, secret, {
    jobId,
    status: "completed",
    finishedAt: new Date().toISOString(),
    raw: { httpx, nuclei, profile: profile || "passive-web" },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "concierge-deep-scan-worker" });
  }
  if (req.method === "POST" && url.pathname === "/scan") {
    if (!authOk(req)) return json(res, 401, { error: "unauthorized" });
    try {
      const body = await readBody(req);
      if (!body?.jobId || !body?.target || !body?.completeUrl) {
        return json(res, 400, { error: "jobId, target, completeUrl required" });
      }
      json(res, 202, { ok: true, accepted: true, jobId: body.jobId });
      void runJob(body).catch(async (err) => {
        try {
          await postComplete(body.completeUrl, body.secret, {
            jobId: body.jobId,
            status: "failed",
            error: String(err?.message || err),
          });
        } catch {
          /* ignore */
        }
      });
      return;
    } catch (e) {
      return json(res, 400, { error: String(e?.message || e) });
    }
  }
  return json(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`[concierge-deep-scan-worker] listening on :${PORT}`);
});
