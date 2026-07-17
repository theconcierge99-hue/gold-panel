/**
 * Verify CDP API credentials against the x402 facilitator /supported endpoint.
 *
 * Usage (PowerShell):
 *   $env:CDP_API_KEY_ID="..."
 *   $env:CDP_API_KEY_SECRET="..."
 *   npx tsx scripts/verify-cdp-x402-credentials.ts
 */
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const apiKeyId = process.env.CDP_API_KEY_ID?.trim();
const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim();

if (!apiKeyId || !apiKeySecret) {
  console.error("Missing CDP_API_KEY_ID or CDP_API_KEY_SECRET in environment.");
  process.exit(1);
}

const requestHost = "api.cdp.coinbase.com";
const requestPath = "/platform/v2/x402/supported";

try {
  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "GET",
    requestHost,
    requestPath,
  });

  const res = await fetch(`https://${requestHost}${requestPath}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
      "Correlation-Context": "sdkLanguage=typescript,source=concierge-agent",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text.slice(0, 2000));

  if (!res.ok) {
    console.error("\nCDP credentials are not accepted by the x402 facilitator.");
    console.error("Check Vercel env: Secret API Key (not Client API Key), no quotes, full secret on one line.");
    process.exit(1);
  }

  console.log("\nCDP x402 credentials OK.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("CDP credential check failed:", message);
  if (/invalid key format/i.test(message)) {
    console.error(
      "Secret format issue: use the Ed25519 secret as one base64 line, or paste the full PEM with newlines.",
    );
  }
  process.exit(1);
}
