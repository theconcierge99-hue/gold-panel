import {
  CATALOG,
  DEFAULT_ORIGIN,
  getCatalogEntry,
  payCurlHint,
  resourceUrl,
  type CatalogEntry,
  type ResourceKind,
} from "./catalog.js";
import { parsePaymentRequired, type X402Accept } from "./payment.js";
import {
  ConciergeAgentError,
  PaymentRequiredError,
  type CallResult,
  type ConciergeAgentOptions,
  type DiscoverySnapshot,
  type SettleContext,
} from "./types.js";

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export class ConciergeAgentClient {
  readonly origin: string;
  paymentSignature?: string;
  creditsWallet?: string;
  agentId?: string;

  private readonly fetchFn: typeof fetch;
  private readonly settlePayment?: ConciergeAgentOptions["settlePayment"];

  constructor(options: ConciergeAgentOptions = {}) {
    this.origin = (options.origin ?? DEFAULT_ORIGIN).replace(/\/$/, "");
    this.fetchFn = options.fetch ?? fetch;
    this.paymentSignature = options.paymentSignature;
    this.creditsWallet = options.creditsWallet;
    this.agentId = options.agentId;
    this.settlePayment = options.settlePayment;
  }

  /** Built-in offline catalog (stable kinds + paths + list prices). */
  catalog(filter?: { tag?: string; prefix?: string }): CatalogEntry[] {
    let rows = [...CATALOG];
    if (filter?.prefix) {
      const p = filter.prefix;
      rows = rows.filter((r) => r.kind.startsWith(p));
    }
    if (filter?.tag) {
      const t = filter.tag;
      rows = rows.filter((r) => r.tags.includes(t));
    }
    return rows;
  }

  resolve(kind: ResourceKind | string): CatalogEntry | undefined {
    return getCatalogEntry(kind);
  }

  url(kind: ResourceKind | string): string {
    return resourceUrl(this.origin, kind);
  }

  /** Shell hint when the runtime has no wallet (pay.sh / AgentCash). */
  payCurl(kind: ResourceKind | string, body?: unknown): string {
    return payCurlHint(this.origin, kind, body);
  }

  /** Live discovery: well-known x402 + OpenAPI + agent card + A2A mesh. */
  async discover(options?: { includeOpenApi?: boolean }): Promise<DiscoverySnapshot> {
    const includeOpenApi = options?.includeOpenApi !== false;
    const [wellKnown, openapi, agentCard, a2aMesh] = await Promise.all([
      this.getJson("/.well-known/x402"),
      includeOpenApi ? this.getJson("/openapi.json") : Promise.resolve(undefined),
      this.getJson("/.well-known/agent-card.json").catch(() => undefined),
      this.getJson("/api/agent-a2a-mesh").catch(() => undefined),
    ]);

    const wk = (wellKnown ?? {}) as Record<string, unknown>;
    const resourceUrls = Array.isArray(wk.resources)
      ? (wk.resources as string[])
      : CATALOG.map((e) => `${this.origin}${e.path}`);

    const liveCatalog = this.mergeLiveCatalog(openapi as Record<string, unknown> | undefined);

    return {
      origin: this.origin,
      serviceName: typeof wk.serviceName === "string" ? wk.serviceName : "Concierge Agent",
      description: typeof wk.description === "string" ? wk.description : undefined,
      resourceUrls,
      catalog: liveCatalog,
      links: (wk.links as Record<string, unknown>) ?? {},
      openapi: openapi as Record<string, unknown> | undefined,
      agentCard: agentCard as Record<string, unknown> | undefined,
      a2aMesh: a2aMesh as Record<string, unknown> | undefined,
      mcpUrl: `${this.origin}/api/mcp`,
    };
  }

  async getCreditsBalance(wallet?: string): Promise<{
    balanceCredits: number;
    balanceUsd: string;
    enabled: boolean;
  }> {
    const w = wallet ?? this.creditsWallet;
    if (!w) throw new ConciergeAgentError("creditsWallet required", 400, null);
    const data = (await this.getJson(`/api/tcx-credits?wallet=${encodeURIComponent(w)}`)) as {
      balanceCredits: number;
      balanceUsd: string;
      enabled: boolean;
    };
    return data;
  }

  /**
   * Call a paid resource.
   * - With `paymentSignature` / `creditsWallet`: sends auth headers.
   * - On 402: if `settlePayment` is set, settles and retries once; else throws PaymentRequiredError.
   */
  async call<T = unknown>(
    kind: ResourceKind | string,
    body: Record<string, unknown> = {},
    options?: { paymentSignature?: string; retries?: number },
  ): Promise<CallResult<T>> {
    const entry = getCatalogEntry(kind);
    const url = this.url(kind);
    const priceUsd = entry?.priceUsd;

    const attempt = async (signature?: string): Promise<CallResult<T>> => {
      const headers = this.buildHeaders(signature);
      const res = await this.fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
      });
      const paymentRequired = res.headers.get("PAYMENT-REQUIRED") ?? undefined;
      const paymentRequiredPayload = parsePaymentRequired(paymentRequired);
      const parsed = (await readBody(res)) as T;
      return {
        ok: res.ok,
        status: res.status,
        body: parsed,
        paymentRequired,
        paymentRequiredPayload,
        headers: res.headers,
      };
    };

    let result = await attempt(options?.paymentSignature ?? this.paymentSignature);

    if (result.status === 402 && this.settlePayment && (options?.retries ?? 1) > 0) {
      const header = result.paymentRequired ?? "";
      const payload = result.paymentRequiredPayload;
      const accepts = (payload?.accepts ?? []) as X402Accept[];
      const ctx: SettleContext = {
        kind,
        url,
        paymentRequiredHeader: header,
        accepts,
        payload: payload ?? {},
        priceUsd,
      };
      const signature = await this.settlePayment(ctx);
      this.paymentSignature = signature;
      result = await attempt(signature);
    }

    if (result.status === 402) {
      throw new PaymentRequiredError({
        kind: String(kind),
        url,
        paymentRequired: result.paymentRequired ?? "",
        accepts: (result.paymentRequiredPayload?.accepts ?? []) as X402Accept[],
        payload: result.paymentRequiredPayload ?? null,
        body: result.body,
      });
    }

    if (!result.ok) {
      const errMsg =
        result.body &&
        typeof result.body === "object" &&
        "error" in result.body &&
        typeof (result.body as { error: unknown }).error === "string"
          ? (result.body as { error: string }).error
          : `HTTP ${result.status}`;
      throw new ConciergeAgentError(errMsg, result.status, result.body);
    }

    return result;
  }

  /** Free A2A mesh discovery (no payment). */
  async a2aMesh(): Promise<Record<string, unknown>> {
    return (await this.getJson("/api/agent-a2a-mesh")) as Record<string, unknown>;
  }

  /** Service agent card JSON (HTTP A2A discovery). */
  async agentCard(): Promise<Record<string, unknown>> {
    return (await this.getJson("/.well-known/agent-card.json")) as Record<string, unknown>;
  }

  /** EIP-8004 registration file for a Concierge `agt_…` (on-chain agentURI). */
  async agentRegistration(agtId: string): Promise<Record<string, unknown>> {
    const id = encodeURIComponent(agtId.trim());
    return (await this.getJson(`/api/agent-identity-registration?id=${id}`)) as Record<
      string,
      unknown
    >;
  }

  /** Prepare Base Identity Registry register(agentURI) payload for an `agt_…`. */
  async prepareErc8004(agtId: string): Promise<Record<string, unknown>> {
    const id = encodeURIComponent(agtId.trim());
    return (await this.getJson(`/api/agent-identity-erc8004?id=${id}`)) as Record<string, unknown>;
  }

  /**
   * Link a verified Base Identity Registry mint to `agt_…`.
   * Caller must already have sent `register(agentURI)` from the agent EVM wallet.
   */
  async linkErc8004(input: {
    id: string;
    agentId: string | number;
    txHash: `0x${string}` | string;
  }): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.origin}/api/agent-identity-erc8004`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        agentId: String(input.agentId),
        txHash: input.txHash,
      }),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new ConciergeAgentError(
        `linkErc8004 failed: HTTP ${res.status}`,
        res.status,
        body,
      );
    }
    return body as Record<string, unknown>;
  }

  /** Convenience namespace for intel desks. */
  get intel() {
    const call = this.call.bind(this);
    return {
      tvl: (body: Record<string, unknown> = {}) => call("intel-tvl", body),
      yields: (body: Record<string, unknown> = {}) => call("intel-yields", body),
      whales: (body: Record<string, unknown> = {}) => call("intel-whales", body),
      wallet: (body: Record<string, unknown>) => call("intel-wallet", body),
      verdict: (body: Record<string, unknown> = {}) => call("intel-verdict", body),
      airdrop: (body: Record<string, unknown> = {}) => call("intel-airdrop", body),
      listing: (body: Record<string, unknown> = {}) => call("intel-listing", body),
      momentum: (body: Record<string, unknown> = {}) => call("intel-momentum", body),
      scalp: (body: Record<string, unknown> = {}) => call("intel-scalp", body),
      macro: (body: Record<string, unknown> = {}) => call("intel-macro", body),
      wire: (body: Record<string, unknown> = {}) => call("intel-wire", body),
      meteora: (body: Record<string, unknown> = {}) => call("intel-meteora", body),
      deskBrief: (body: Record<string, unknown> = {}) => call("intel-desk-brief", body),
      a2aPipeline: (body: Record<string, unknown> = {}) => call("intel-a2a-pipeline", body),
    };
  }

  get security() {
    const call = this.call.bind(this);
    return {
      readiness: (body: Record<string, unknown>) => call("security-readiness", body),
      headers: (body: Record<string, unknown>) => call("security-headers", body),
      scan: (body: Record<string, unknown>) => call("security-scan", body),
    };
  }

  private buildHeaders(signature?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (signature) headers["PAYMENT-SIGNATURE"] = signature;
    if (this.creditsWallet) headers["x-tcx-credits-wallet"] = this.creditsWallet;
    if (this.agentId) headers["x-concierge-agent-id"] = this.agentId;
    return headers;
  }

  private async getJson(path: string): Promise<unknown> {
    const res = await this.fetchFn(`${this.origin}${path}`, {
      headers: { Accept: "application/json" },
    });
    const body = await readBody(res);
    if (!res.ok) {
      const msg =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
      throw new ConciergeAgentError(msg, res.status, body);
    }
    return body;
  }

  /** Prefer live OpenAPI summaries when present; fall back to static catalog. */
  private mergeLiveCatalog(openapi: Record<string, unknown> | undefined): CatalogEntry[] {
    if (!openapi || typeof openapi !== "object") return [...CATALOG];
    const paths = openapi.paths as Record<string, Record<string, unknown>> | undefined;
    if (!paths) return [...CATALOG];

    return CATALOG.map((entry) => {
      const item = paths[entry.path];
      const post = item?.post as Record<string, unknown> | undefined;
      if (!post) return entry;
      const payment = post["x-payment-info"] as { priceUsd?: string } | undefined;
      return {
        ...entry,
        name: typeof post.summary === "string" ? post.summary : entry.name,
        description: typeof post.description === "string" ? post.description : entry.description,
        priceUsd: payment?.priceUsd ? String(payment.priceUsd) : entry.priceUsd,
        tags: Array.isArray(post.tags) ? (post.tags as string[]) : entry.tags,
      };
    });
  }
}

export function createConciergeAgent(options?: ConciergeAgentOptions): ConciergeAgentClient {
  return new ConciergeAgentClient(options);
}
