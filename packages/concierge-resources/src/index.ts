/**
 * @conc-exe/concierge-resources — discover and execute Concierge pay-per-use resources (MVP).
 */
export type ResourceCatalogEntry = {
  slug: string;
  kind: string;
  name: string;
  description: string;
  method: "POST";
  path: string;
  priceUsdc: number;
  priceLabel: string;
  creditsCost: number;
  category: string;
  tags: string[];
  url: string;
};

export type ResourcesCatalog = {
  version: string;
  service: string;
  payment: string[];
  credits: { header: string; unit: string; note: string };
  resources: ResourceCatalogEntry[];
};

export type ConciergeResourcesClientOptions = {
  origin?: string;
  fetch?: typeof fetch;
  /** Solana wallet for TCX prepaid credits (optional) */
  creditsWallet?: string;
  /** x402 PAYMENT-SIGNATURE header value (optional — set by your wallet layer) */
  paymentSignature?: string;
};

const DEFAULT_ORIGIN = "https://conc-exe.xyz";

export class ConciergeResourcesClient {
  readonly origin: string;
  private readonly fetchFn: typeof fetch;
  creditsWallet?: string;
  paymentSignature?: string;

  constructor(options: ConciergeResourcesClientOptions = {}) {
    this.origin = (options.origin ?? DEFAULT_ORIGIN).replace(/\/$/, "");
    this.fetchFn = options.fetch ?? fetch;
    this.creditsWallet = options.creditsWallet;
    this.paymentSignature = options.paymentSignature;
  }

  async discoverResources(): Promise<ResourcesCatalog> {
    const res = await this.fetchFn(`${this.origin}/api/resources`);
    if (!res.ok) throw new Error(`discoverResources failed (${res.status})`);
    return (await res.json()) as ResourcesCatalog;
  }

  async resourceDetail(slug: string): Promise<ResourceCatalogEntry | null> {
    const catalog = await this.discoverResources();
    return catalog.resources.find((r) => r.slug === slug || r.kind === slug) ?? null;
  }

  async getCreditsBalance(wallet: string): Promise<{
    balanceCredits: number;
    balanceUsd: string;
    enabled: boolean;
  }> {
    const res = await this.fetchFn(
      `${this.origin}/api/tcx-credits?wallet=${encodeURIComponent(wallet)}`,
    );
    if (!res.ok) throw new Error(`getCreditsBalance failed (${res.status})`);
    const data = (await res.json()) as {
      balanceCredits: number;
      balanceUsd: string;
      enabled: boolean;
    };
    return data;
  }

  async executeResource(
    slug: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown; paymentRequired?: string }> {
    const detail = await this.resourceDetail(slug);
    if (!detail) throw new Error(`Unknown resource slug: ${slug}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.paymentSignature) {
      headers["PAYMENT-SIGNATURE"] = this.paymentSignature;
    }
    if (this.creditsWallet) {
      headers["x-tcx-credits-wallet"] = this.creditsWallet;
    }

    const res = await this.fetchFn(detail.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const paymentRequired = res.headers.get("PAYMENT-REQUIRED") ?? undefined;
    let body: unknown;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    return { status: res.status, body, paymentRequired };
  }
}
