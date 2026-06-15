import * as esbuild from "esbuild";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bufferShim = join(root, "scripts", "buffer-shim.js");

await esbuild.build({
  entryPoints: ["frontend/lib/dlmm-browser.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: join(root, "frontend/public/js/dlmm-bot.mjs"),
  minify: true,
  inject: [bufferShim],
  define: { global: "globalThis" },
  alias: {
    util: "util/",
  },
  logLevel: "info",
});

writeFileSync(join(root, "frontend/public/js/dlmm-bot-build-id.txt"), Date.now().toString(36));
console.log("Built public/js/dlmm-bot.mjs");
