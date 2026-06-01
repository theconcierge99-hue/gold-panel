import { handleSignalPublish } from "./lib/signal-publish-handler";

/** Node — Metaplex NFT mint to creator Solana wallet */
export const config = {
  runtime: "nodejs",
};

export default handleSignalPublish;
