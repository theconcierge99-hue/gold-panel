/**
 * Concierge Resources catalog — unified discovery for agents (XONA / 402ladder style).
 */
import { X402_DISCOVERY_RESOURCES } from "./x402-discovery";
import {
  creditsCostForResource,
  isMvpResourceKind,
  priceUsdcForResource,
  type X402MvpResourceKind,
  type X402ResourceKind,
} from "./x402-pricing";

export type ResourceCatalogEntry = {
  slug: string;
  kind: X402ResourceKind;
  name: string;
  description: string;
  method: "POST";
  path: string;
  priceUsdc: number;
  priceLabel: string;
  creditsCost: number;
  category: "creative" | "intel" | "security" | "lounge";
  tags: string[];
  url: string;
};

export const MVP_RESOURCE_PATHS: Record<X402MvpResourceKind, string> = {
  "resource-chat": "/api/resource/chat",
  "resource-image": "/api/resource/image",
  "resource-scaffold": "/api/resource/scaffold",
};

function categoryForKind(kind: X402ResourceKind): ResourceCatalogEntry["category"] {
  if (isMvpResourceKind(kind)) return "creative";
  if (kind.startsWith("intel-")) return "intel";
  if (kind.startsWith("security-")) return "security";
  return "lounge";
}

export function buildResourcesCatalog(origin: string): {
  version: string;
  service: string;
  payment: string[];
  credits: { header: string; unit: string; note: string };
  resources: ResourceCatalogEntry[];
} {
  const base = origin.replace(/\/$/, "");
  const resources: ResourceCatalogEntry[] = X402_DISCOVERY_RESOURCES.map((r) => ({
    slug: r.kind,
    kind: r.kind,
    name: r.name,
    description: r.description,
    method: r.method,
    path: r.path,
    priceUsdc: priceUsdcForResource(r.kind),
    priceLabel: `$${priceUsdcForResource(r.kind).toFixed(2)}`,
    creditsCost: creditsCostForResource(r.kind),
    category: categoryForKind(r.kind),
    tags: [...r.tags],
    url: `${base}${r.path}`,
  }));

  return {
    version: "1.0.0-mvp",
    service: "Concierge Resources",
    payment: ["x402 USDC", "TCX self-settle", "TCX prepaid credits (MVP resources)"],
    credits: {
      header: "x-tcx-credits-wallet",
      unit: "1 credit = $0.01",
      note: "Eligible on resource-chat, resource-image, resource-scaffold when TCX is live.",
    },
    resources,
  };
}

export function mvpResourceKinds(): X402MvpResourceKind[] {
  return ["resource-chat", "resource-image", "resource-scaffold"];
}
