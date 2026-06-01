import { handleSignalPublish } from "./lib/signal-publish-handler";

/** Node — Metaplex NFT mint (background) + KV */
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default handleSignalPublish;
