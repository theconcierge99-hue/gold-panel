import * as esbuild from "esbuild";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bufferShim = join(root, "scripts", "buffer-shim.js");

await esbuild.build({
  entryPoints: ["frontend/lib/agent-identity-browser.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: join(root, "frontend/public/js/agent-identity.mjs"),
  minify: true,
  inject: [bufferShim],
  define: { global: "globalThis" },
});

const buildId = Date.now().toString(36);
writeFileSync(join(root, "frontend/public/js/agent-identity-build-id.txt"), buildId);
console.log(`Built public/js/agent-identity.mjs (build ${buildId})`);
