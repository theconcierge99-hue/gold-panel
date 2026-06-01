import { handleSignalPublish } from "./lib/signal-publish-handler";

/** Edge — publish + KV; Solana NFT mint runs on /api/rwa-mint-sol (Node) */
export const config = {
  runtime: "edge",
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  return handleSignalPublish(request);
}
