import { defineConfig } from "drizzle-kit";

/**
 * `npm run db:generate -w @advantage/db` writes SQL into ./migrations.
 * There is no connection string on purpose: the database lives in the browser,
 * so generate is the only drizzle-kit command this package can run. The
 * generated files are applied at runtime by src/migrator.ts.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",
  strict: true,
  verbose: true,
});
