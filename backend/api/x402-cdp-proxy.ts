import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Node-runtime proxy for CDP facilitator verify/settle.
 * Coinbase's perimeter WAF returns HTML 403 to requests from Vercel Edge egress,
 * so the Edge x402 gate forwards CDP calls here (AWS Lambda egress) instead.
 * Auth: SHA-256 of CDP_API_KEY_SECRET shared between runtimes via env.
 * Self-contained (no local imports) — the @vercel/node bundler drops extensionless
 * ESM imports outside /api at runtime.
 */

const CDP_BASE = "https://api.cdp.coinbase.com/platform/v2/x402";

function bytesToB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function utf8ToB64Url(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64url");
}

function randomHexNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateCdpJwt(options: {
  apiKeyId: string;
  apiKeySecret: string;
  requestMethod: string;
  requestHost: string;
  requestPath: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: options.apiKeyId,
    iss: "cdp",
    uris: [`${options.requestMethod} ${options.requestHost}${options.requestPath}`],
    iat: now,
    nbf: now,
    exp: now + 120,
  };

  let alg: "EdDSA" | "ES256";
  let key: CryptoKey;
  let signParams: AlgorithmIdentifier | EcdsaParams;

  if (options.apiKeySecret.includes("-----BEGIN")) {
    const body = options.apiKeySecret
      .replace(/-----BEGIN [A-Z ]+-----/g, "")
      .replace(/-----END [A-Z ]+-----/g, "")
      .replace(/\s+/g, "");
    const der = new Uint8Array(Buffer.from(body, "base64"));
    alg = "ES256";
    key = await crypto.subtle.importKey(
      "pkcs8",
      der.buffer as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    signParams = { name: "ECDSA", hash: "SHA-256" };
  } else {
    const decoded = new Uint8Array(Buffer.from(options.apiKeySecret.replace(/\s+/g, ""), "base64"));
    if (decoded.length !== 64) {
      throw new Error("CDP_API_KEY_SECRET is not a valid Ed25519 (base64) or EC PEM key");
    }
    const jwk = {
      kty: "OKP",
      crv: "Ed25519",
      d: bytesToB64Url(decoded.subarray(0, 32)),
      x: bytesToB64Url(decoded.subarray(32)),
    };
    alg = "EdDSA";
    key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
    signParams = { name: "Ed25519" };
  }

  const header = { alg, kid: options.apiKeyId, typ: "JWT", nonce: randomHexNonce() };
  const signingInput = `${utf8ToB64Url(JSON.stringify(header))}.${utf8ToB64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(signParams, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToB64Url(new Uint8Array(signature))}`;
}

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
