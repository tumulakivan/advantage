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
   * The workspace packages are consumed as TypeScript source (no build step),
   * so they must not be pre-bundled - the SQLite worker inside @advantage/db
   * needs Vite to see `new Worker(new URL(...))` in source form. sqlite-wasm is
   * excluded because its Emscripten glue resolves the .wasm relative to itself.
   */
  optimizeDeps: {
    exclude: ["@advantage/db", "@advantage/core", "@advantage/theme", "@sqlite.org/sqlite-wasm"],
  },

  worker: {
    format: "es",
  },

  server: {
    port: 5173,
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
