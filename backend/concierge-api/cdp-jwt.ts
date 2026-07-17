/**
 * Edge-safe CDP JWT generation (Web Crypto only, no Buffer).
 * The official @coinbase/cdp-sdk/auth generateJwt relies on Node Buffer,
 * which is unavailable in the Vercel Edge runtime used by the API router.
 * Supports Ed25519 (base64, 64-byte seed+public) and EC ES256 (PKCS8 PEM) keys.
 */

type CdpJwtOptions = {
  apiKeyId: string;
  apiKeySecret: string;
  requestMethod: string;
  requestHost: string;
  requestPath: string;
  expiresIn?: number;
};

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function utf8ToB64Url(text: string): string {
  return bytesToB64Url(new TextEncoder().encode(text));
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomHexNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isPemEcKey(secret: string): boolean {
  return secret.includes("-----BEGIN");
}

function decodeEd25519Secret(secret: string): Uint8Array | null {
  try {
    const decoded = b64ToBytes(secret.replace(/\s+/g, ""));
    return decoded.length === 64 ? decoded : null;
  } catch {
    return null;
  }
}

async function importEd25519Key(decoded: Uint8Array): Promise<CryptoKey> {
  const jwk = {
    kty: "OKP",
    crv: "Ed25519",
    d: bytesToB64Url(decoded.subarray(0, 32)),
    x: bytesToB64Url(decoded.subarray(32)),
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
}

async function importEcPemKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const der = b64ToBytes(body);
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Generates a CDP Bearer JWT for one facilitator request. */
export async function generateCdpJwt(options: CdpJwtOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresIn ?? 120;
  const nonce = randomHexNonce();

  const claims = {
    sub: options.apiKeyId,
    iss: "cdp",
    uris: [`${options.requestMethod} ${options.requestHost}${options.requestPath}`],
    iat: now,
    nbf: now,
    exp: now + expiresIn,
  };

  let alg: "EdDSA" | "ES256";
  let key: CryptoKey;
  let signParams: AlgorithmIdentifier | EcdsaParams;

  if (isPemEcKey(options.apiKeySecret)) {
    alg = "ES256";
    key = await importEcPemKey(options.apiKeySecret);
    signParams = { name: "ECDSA", hash: "SHA-256" };
  } else {
    const decoded = decodeEd25519Secret(options.apiKeySecret);
    if (!decoded) {
      throw new Error(
        "CDP_API_KEY_SECRET is not a valid Ed25519 (base64) or EC PEM key — re-copy the Secret API Key from the CDP portal",
      );
    }
    alg = "EdDSA";
    key = await importEd25519Key(decoded);
    signParams = { name: "Ed25519" };
  }

  const header = { alg, kid: options.apiKeyId, typ: "JWT", nonce };
  const signingInput = `${utf8ToB64Url(JSON.stringify(header))}.${utf8ToB64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    signParams,
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${bytesToB64Url(new Uint8Array(signature))}`;
}
