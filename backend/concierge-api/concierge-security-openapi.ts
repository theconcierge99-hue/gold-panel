/** OpenAPI path item for free scope validation (no x402). */
export function openApiSecurityScopePathItem(origin: string): Record<string, unknown> {
  return {
    post: {
      operationId: "conciergeSecurityScope",
      summary: "Validate security probe scope (free)",
      description:
        "Validates that a target is outside Concierge platform infrastructure and optionally matches a hostname allowlist. No outbound probing. conc-exe.xyz and project Vercel hosts are always forbidden.",
      tags: ["security"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["target"],
              properties: {
                target: { type: "string", description: "External https origin to validate" },
                allowlist: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional hostname allowlist (*.example.com)",
                },
              },
            },
            example: {
              target: "https://api.example.com",
              allowlist: ["*.example.com"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Target passed platform guard and allowlist",
          content: {
            "application/json": {
              schema: { type: "object" },
              example: {
                ok: true,
                kind: "security-scope",
                target: { origin: "https://api.example.com", hostname: "api.example.com" },
                platformGuard: { passed: true },
                allowlistMatched: true,
              },
            },
          },
        },
        "400": { description: "Invalid target or allowlist mismatch" },
        "403": { description: "Platform scope forbidden — Concierge infrastructure cannot be probed" },
      },
      "x-payment-info": {
        priceUsd: "0.00",
        note: "Free — scope validation only",
        url: `${origin}/api/concierge-security-scope`,
      },
    },
  };
}
