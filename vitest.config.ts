import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test config.
 *
 * Two things the suite needs that Vite does not do on its own:
 *
 * - The `@/` alias, so a test can import a module the same way the app does
 *   (`@/lib/...`) instead of only by relative path. Mirrors the `paths`
 *   mapping in tsconfig.json.
 * - The `react-server` condition, which is how `server-only` resolves to an
 *   empty module on the server. Next.js sets this for every server bundle;
 *   without it, importing anything under `src/lib/data/` throws "This module
 *   cannot be imported from a Client Component module".
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(root, "src") },
  },
  ssr: {
    resolve: {
      conditions: ["react-server"],
    },
  },
});
