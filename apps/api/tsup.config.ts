import { defineConfig } from "tsup";

/**
 * The service is written as ESM TypeScript without file extensions on its
 * imports, which Node cannot run directly. Bundling sidesteps that rather than
 * littering every import with `.js`. Prisma stays external because its client
 * loads a platform-specific engine binary from its own package directory.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  external: ["@prisma/client", ".prisma/client"],
});
