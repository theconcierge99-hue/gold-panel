import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateCdpJwt } from "../concierge-api/cdp-jwt";

/**
 * Node-runtime proxy for CDP facilitator verify/settle.
 * Coinbase's perimeter WAF returns HTML 403 to requests from Vercel Edge egress,
 * so the Edge x402 gate forwards CDP calls here (AWS Lambda egress) instead.
 * Auth: SHA-256 of CDP_API_KEY_SECRET shared between runtimes via env.
 */

const CDP_BASE = "https://api.cdp.coinbase.com/platform/v2/x402";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyId = process.env.CDP_API_KEY_ID?.trim();
  const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!apiKeyId || !apiKeySecret) {
    res.status(503).json({ error: "CDP credentials are not configured" });
    return;
  }

  const provided = String(req.headers["x-internal-cdp"] ?? "");
  if (!provided || provided !== (await sha256Hex(apiKeySecret))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = (typeof req.body === "object" && req.body ? req.body : {}) as {
    endpoint?: string;
    body?: unknown;
  };
  const endpoint = payload.endpoint;
  if (endpoint !== "verify" && endpoint !== "settle") {
    res.status(400).json({ error: "endpoint must be verify or settle" });
    return;
  }

  try {
    const base = new URL(CDP_BASE);
    const jwt = await generateCdpJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: "POST",
      requestHost: base.host,
      requestPath: `${base.pathname}/${endpoint}`,
    });

    const upstream = await fetch(`${CDP_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${jwt}`,
        "Correlation-Context": "sdkLanguage=typescript,source=concierge-agent",
      },
      body: JSON.stringify(payload.body ?? {}),
      signal: AbortSignal.timeout(25_000),
    });

    const text = await upstream.text();
    const extResponses = upstream.headers.get("extension-responses");
    if (extResponses) res.setHeader("extension-responses", extResponses);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    res.status(upstream.status).send(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[x402-cdp-proxy]", msg);
    res.status(502).json({ error: `CDP proxy failed: ${msg.slice(0, 200)}` });
  }
}
