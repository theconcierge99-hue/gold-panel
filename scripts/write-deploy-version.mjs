import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let sha = "unknown";
try {
  sha = execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
} catch {
  sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "unknown";
}
writeFileSync(join(root, "frontend/public/deploy-version.txt"), `${sha}\n`);
console.log(`deploy-version.txt → ${sha}`);
