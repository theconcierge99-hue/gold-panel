import { facilitator } from "@payai/facilitator";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Network, PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";

import {
  getMerchantAddresses,
  getX402NetworkProfile,
  isX402Enabled,
  X402_PRICE_LABEL,
  X402_PRICE_MONEY,
  X402_PRICE_USDC,
} from "./x402-config";

export type X402ResourceKind = "news" | "concierge";

const RESOURCE_META: Record<X402ResourceKind, { description: string; mimeType: string }> = {
  news: {
    description: "Open one news article (full story link)",
    mimeType: "application/json",
  },
  concierge: {
    description: "Concierge AI chat turn (single request)",
    mimeType: "application/json",
  },
};

let resourceServerPromise: Promise<x402ResourceServer> | null = null;

function b64EncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
}

function getPaymentSignatureHeader(request: Request): string | null {
  return request.headers.get("payment-signature") ?? request.headers.get("PAYMENT-SIGNATURE");
}

function decodePaymentPayload(header: string): PaymentPayload | null {
  try {
    const json = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(json) as PaymentPayload;
  } catch {
    return null;
  }
}

async function getResourceServer(): Promise<x402ResourceServer> {
  if (!resourceServerPromise) {
    resourceServerPromise = (async () => {
      const client = new HTTPFacilitatorClient(facilitator);
      const server = new x402ResourceServer(client);
      const nets = getX402NetworkProfile();
      server.register(nets.evm, new ExactEvmScheme());
      server.register(nets.sol, new ExactSvmScheme());
      await server.initialize();
      return server;
    })();
  }
  return resourceServerPromise;
}

function resourceUrl(request: Request, kind: X402ResourceKind): string {
  const host = request.headers.get("host") || "localhost";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const path = kind === "news" ? "/api/news-open" : "/api/concierge";
  return `${proto}://${host}${path}`;
}

async function buildAccepts(request: Request, kind: X402ResourceKind): Promise<PaymentRequirements[]> {
  const server = await getResourceServer();
  const nets = getX402NetworkProfile();
  const { evm, sol } = getMerchantAddresses();
  const meta = RESOURCE_META[kind];
  const url = resourceUrl(request, kind);

  const options: Array<{
    scheme: string;
    payTo: string;
    price: string;
    network: Network;
    maxTimeoutSeconds?: number;
  }> = [];

  if (evm) {
    options.push({
      scheme: "exact",
      payTo: evm,
      price: X402_PRICE_MONEY,
      network: nets.evm as Network,
      maxTimeoutSeconds: 120,
    });
  }
  if (sol) {
    options.push({
      scheme: "exact",
      payTo: sol,
      price: X402_PRICE_MONEY,
      network: nets.sol as Network,
      maxTimeoutSeconds: 120,
    });
  }

  if (!options.length) {
    throw new Error("x402 merchant addresses not configured");
  }

  return server.buildPaymentRequirementsFromOptions(options, {
    resource: { url, description: meta.description, mimeType: meta.mimeType },
  });
}

export async function buildPaymentRequiredResponse(
  request: Request,
  kind: X402ResourceKind,
  cors: Record<string, string>,
  error = "PAYMENT-SIGNATURE header is required",
): Promise<Response> {
  const server = await getResourceServer();
  const requirements = await buildAccepts(request, kind);
  const meta = RESOURCE_META[kind];
  const paymentRequired = await server.createPaymentRequiredResponse(
    requirements,
    {
      url: resourceUrl(request, kind),
      description: meta.description,
      mimeType: meta.mimeType,
    },
    error,
  );
  return new Response(
    JSON.stringify({
      error: "Payment required",
      priceUsdc: X402_PRICE_USDC,
      priceLabel: X402_PRICE_LABEL,
      resource: kind,
    }),
    {
      status: 402,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "PAYMENT-REQUIRED": b64EncodeJson(paymentRequired),
      },
    },
  );
}

export type X402GateResult =
  | {
      ok: true;
      payer: string;
      transaction: string;
      paymentResponseHeader: string | null;
    }
  | { ok: false; response: Response };

export async function requireX402Payment(
  request: Request,
  kind: X402ResourceKind,
  cors: Record<string, string>,
): Promise<X402GateResult> {
  if (!isX402Enabled()) {
    return {
      ok: true,
      payer: "dev-bypass",
      transaction: "",
      paymentResponseHeader: null,
    };
  }

  const sigHeader = getPaymentSignatureHeader(request);
  if (!sigHeader) {
    return { ok: false, response: await buildPaymentRequiredResponse(request, kind, cors) };
  }

  const paymentPayload = decodePaymentPayload(sigHeader);
  if (!paymentPayload) {
    return {
      ok: false,
      response: await buildPaymentRequiredResponse(
        request,
        kind,
        cors,
        "Invalid PAYMENT-SIGNATURE header",
      ),
    };
  }

  const server = await getResourceServer();
  const requirements = await buildAccepts(request, kind);
  const matched = server.findMatchingRequirements(requirements, paymentPayload);
  if (!matched) {
    return {
      ok: false,
      response: await buildPaymentRequiredResponse(
        request,
        kind,
        cors,
        "Payment does not match accepted requirements",
      ),
    };
  }

  const verify = await server.verifyPayment(paymentPayload, matched, {}, request);
  if (!verify.isValid) {
    return {
      ok: false,
      response: await buildPaymentRequiredResponse(
        request,
        kind,
        cors,
        verify.invalidReason || "Payment verification failed",
      ),
    };
  }

  const settle = await server.settlePayment(paymentPayload, matched, {}, request);
  if (!settle.success) {
    return {
      ok: false,
      response: await buildPaymentRequiredResponse(
        request,
        kind,
        cors,
        settle.errorReason || "Payment settlement failed",
      ),
    };
  }

  const paymentResponseHeader = b64EncodeJson({
    success: true,
    transaction: settle.transaction,
    network: settle.network,
    payer: settle.payer,
  });

  return {
    ok: true,
    payer: settle.payer || "unknown",
    transaction: settle.transaction || "",
    paymentResponseHeader,
  };
}

export function getPublicX402Config() {
  const nets = getX402NetworkProfile();
  const { evm, sol } = getMerchantAddresses();
  return {
    enabled: isX402Enabled(),
    facilitator: "PayAI",
    facilitatorUrl: "https://facilitator.payai.network",
    priceUsdc: X402_PRICE_USDC,
    priceLabel: X402_PRICE_LABEL,
    networks: nets,
    acceptsEvm: !!evm,
    acceptsSol: !!sol,
    newsPerArticle: true,
    marketFeedFree: true,
    conciergePerChat: true,
  };
}
