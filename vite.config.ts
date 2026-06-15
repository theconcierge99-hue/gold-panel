import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { conciergeDevPlugin } from "./backend/concierge-dev-plugin";

// Redirect TanStack Start's bundled server entry to frontend/src/server.ts (SSR error wrapper).
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    root: "frontend",
    plugins: [conciergeDevPlugin()],
  },
});
