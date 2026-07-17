/**
 * Generate pay-skills OpenAPI snapshot for Token Pay partner APIs.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const origin = (process.env.ORIGIN ?? "https://conc-exe.xyz").replace(/\/$/, "");
const outPath = join(__dirname, "..", "pay-skills", "conc-exe", "token-pay", "openapi.json");

const doc = {
  openapi: "3.1.0",
  info: {
    title: "Concierge Token Pay",
    version: "0.1.0",
    description:
      "Native SPL x402 self-settle for partner APIs — build accepts, verify settlements, merchant registry. No facilitator wallet. npm SDK @conc-exe/token-x402.",
    contact: {
      name: "Concierge Token Pay",
      url: `${origin}/docs/payment/token-pay`,
    },
  },
  servers: [{ url: origin, description: "Concierge Token Pay" }],
  paths: {
    "/api/token-pay": {
      get: {
        operationId: "tokenPayRegistry",
        summary: "Fetch the Token Pay merchant registry",
        description: "Platform meta + merchant list. ?merchant=ID for readiness.",
        tags: ["Token Pay"],
        responses: { "200": { description: "Registry JSON" } },
      },
    },
    "/api/token-pay-build-accept": {
      post: {
        operationId: "tokenPayBuildAccept",
        summary: "Generate an x402 accept for a partner API",
        description:
          "Server-built SPL self-settle accept. Call from your backend before returning HTTP 402.",
        tags: ["Token Pay"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["merchantId", "usdAmount"],
                properties: {
                  merchantId: {
                    type: "string",
                    description: "Registered Token Pay merchant slug.",
                    example: "acme",
                  },
                  usdAmount: {
                    type: "number",
                    description: "Partner-authorized list price in USD.",
                    example: 0.1,
                  },
                  resourceUrl: {
                    type: "string",
                    format: "uri",
                    description: "Partner API resource protected by this accept.",
                    example: "https://api.acme.xyz/v1/intel",
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "accept + label" } },
      },
    },
    "/api/token-pay-verify": {
      post: {
        operationId: "tokenPayVerify",
        summary: "Verify and settle partner Token Pay",
        description:
          "After wallet signs SPL transfer. Server rebuilds expected accept from merchantId/usdAmount and rejects unless PAYMENT-SIGNATURE accepted matches (including atomic amount); on-chain merchant token delta must be >= matched.amount.",
        tags: ["Token Pay"],
        parameters: [
          {
            name: "PAYMENT-SIGNATURE",
            in: "header",
            required: true,
            description: "Base64 x402 payment payload signed by the payer wallet.",
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["merchantId", "usdAmount"],
                properties: {
                  merchantId: {
                    type: "string",
                    description: "Registered Token Pay merchant slug.",
                  },
                  usdAmount: {
                    type: "number",
                    description: "Server-authorized USD price used to build the original accept.",
                  },
                  resourceUrl: {
                    type: "string",
                    format: "uri",
                    description: "Partner API resource protected by the original accept.",
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Settlement ok" } },
      },
    },
    "/api/token-pay-preview": {
      post: {
        operationId: "tokenPayPreview",
        summary: "Validate merchant config before deploy",
        description: "Onboarding wizard — checks mint, payTo, price, ATA without persisting.",
        tags: ["Token Pay"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["merchant"],
                properties: {
                  merchant: {
                    type: "object",
                    description: "Candidate merchant registry row to validate without persisting.",
                    additionalProperties: true,
                  },
                  resourceKind: { type: "string", enum: ["concierge", "external"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "readiness preview" } },
      },
    },
  },
};

writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath} (${Object.keys(doc.paths).length} paths)`);
