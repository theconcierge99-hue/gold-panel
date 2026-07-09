import * as esbuild from "esbuild";
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bufferShim = join(root, "scripts", "buffer-shim.js");

await esbuild.build({
  entryPoints: ["frontend/lib/x402-browser-client.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: join(root, "frontend/public/js/x402-pay.mjs"),
  minify: true,
  sourcemap: false,
  logLevel: "info",
  inject: [bufferShim],
  define: {
    global: "globalThis",
  },
});

const buildId = Date.now().toString(36);
writeFileSync(join(root, "frontend/public/js/x402-build-id.txt"), buildId);

const loungeHtml = join(root, "frontend/public/executive-lounge.html");
let lounge = readFileSync(loungeHtml, "utf8");
const nextLounge = lounge.replace(
  /\/js\/x402-pay\.mjs\?v=[^"']+/g,
  `/js/x402-pay.mjs?v=${buildId}`,
);
if (nextLounge !== lounge) {
  writeFileSync(loungeHtml, nextLounge);
  console.log(`Updated executive-lounge.html x402 cache buster → ${buildId}`);
}

console.log(`Built public/js/x402-pay.mjs (build ${buildId})`);
