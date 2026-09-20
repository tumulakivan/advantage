import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const workspaceRoot = searchForWorkspaceRoot(process.cwd());

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  /**
   * The workspace packages are consumed as TypeScript source with no build
   * step, so they must not be pre-bundled from `node_modules`.
   */
  optimizeDeps: {
    exclude: ["@advantage/api-client", "@advantage/core", "@advantage/theme"],
  },

  server: {
    port: 5173,
    /**
     * Fail rather than slide to 5174. The API only accepts credentialed
     * requests from the origins in its WEB_ORIGIN list, so a silent port
     * fallback does not produce a working app on a different port - it
     * produces one where every request is blocked by CORS, which is a much
     * harder thing to recognise than "port already in use".
     */
    strictPort: true,
    fs: {
      allow: [workspaceRoot],
    },
  },

  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Vendor code is big, stable and cacheable; app code changes daily.
         * Splitting them means editing a screen does not re-download Recharts.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) {
            return "charts";
          }
          if (id.includes("@radix-ui") || id.includes("lucide-react")) return "ui";
          if (id.includes("react-router") || id.includes("react-dom") || id.includes("/react/")) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
});
