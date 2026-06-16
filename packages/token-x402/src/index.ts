/**
 * @conc-exe/token-x402 — Concierge Token Pay partner SDK (Beta).
 * Use on your own API: build server-side accepts, return 402, verify via Concierge.
 */

export type TokenPayAccept = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

export type BuildAcceptResult = {
  accept: TokenPayAccept;
  merchantId: string;
  usdAmount: number;
  resourceKind: string;
  resourceUrl?: string;
  network: string;
  label: string;
  links?: {
    verifyUrl?: string;
    configUrl?: string;
    docsUrl?: string;
  };
};

export type VerifyResult = {
  ok: boolean;
  payer?: string;
  transaction?: string;
  network?: string;
  merchantId?: string;
  resourceKind?: string;
  error?: string;
};

export type ConciergeTokenPayClientOptions = {
  /** Concierge API origin, e.g. https://conc-exe.xyz or https://pay.conc-exe.xyz */
  origin?: string;
  fetch?: typeof fetch;
};

const DEFAULT_ORIGIN = "https://conc-exe.xyz";

export class ConciergeTokenPayClient {
  readonly origin: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: ConciergeTokenPayClientOptions = {}) {
    this.origin = (options.origin ?? DEFAULT_ORIGIN).replace(/\/$/, "");
    this.fetchFn = options.fetch ?? fetch;
  }

  /** Fetch merchant config + readiness from Concierge. */
  async getMerchant(merchantId: string, resourceKind = "external") {
    const url = `${this.origin}/api/token-pay?merchant=${encodeURIComponent(merchantId)}&resource=${encodeURIComponent(resourceKind)}`;
    const res = await this.fetchFn(url, { headers: { Accept: "application/json" } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.merchant as Record<string, unknown>;
  }

  /** Server-built accept — call from your backend before returning 402. */
  async buildAccept(input: {
    merchantId: string;
    usdAmount: number;
    resourceUrl?: string;
  }): Promise<BuildAcceptResult> {
    const res = await this.fetchFn(`${this.origin}/api/token-pay-build-accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as BuildAcceptResult;
  }

  /**
   * Verify + settle after user signed SPL transfer.
   * Pass base64 PAYMENT-SIGNATURE payload (x402 v2 payment object).
   */
  async verifyPayment(input: {
    merchantId: string;
    usdAmount: number;
    resourceUrl?: string;
    paymentSignature: string;
  }): Promise<VerifyResult> {
    const res = await this.fetchFn(`${this.origin}/api/token-pay-verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "PAYMENT-SIGNATURE": input.paymentSignature,
      },
      body: JSON.stringify({
        merchantId: input.merchantId,
        usdAmount: input.usdAmount,
        resourceUrl: input.resourceUrl,
      }),
    });
    const data = (await res.json()) as VerifyResult;
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ...data, ok: true };
  }

  /** Build PAYMENT-REQUIRED header value for HTTP 402 responses. */
  buildPaymentRequired(accept: TokenPayAccept, resourceUrl?: string): string {
    const payload = {
      x402Version: 2,
      accepts: [accept],
      resource: resourceUrl,
      error: "PAYMENT-SIGNATURE header is required",
    };
    return b64EncodeJson(payload);
  }
}

export function b64EncodeJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function b64DecodeJson<T>(header: string): T | null {
  try {
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(header, "base64").toString("utf-8");
    } else {
      const binary = atob(header);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    }
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function createConciergeTokenPayClient(options?: ConciergeTokenPayClientOptions) {
  return new ConciergeTokenPayClient(options);
}
