import * as esbuild from "esbuild";
import { createRequire } from "module";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bufferShim = join(root, "scripts", "buffer-shim.js");

await esbuild.build({
  entryPoints: ["lib/mint-signal-browser.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: join(root, "public/js/mint-signal.mjs"),
  minify: true,
  inject: [bufferShim],
  define: { global: "globalThis" },
  logLevel: "info",
});

writeFileSync(join(root, "public/js/mint-signal-build-id.txt"), Date.now().toString(36));
console.log("Built public/js/mint-signal.mjs");
