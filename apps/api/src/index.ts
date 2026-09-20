import { createApp } from "./app";
import { disconnect } from "./db/client";
import { adminEmailList, env } from "./env";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`adVantage API listening on http://localhost:${env.PORT}`);

  /**
   * Say who the admins are on the way up.
   *
   * Admin is configuration rather than a column, which is what makes it
   * impossible to grant through the product - but it also means a typo in an
   * address fails silently, as a screen that never appears. Printing the list
   * turns that into something you can see.
   */
  if (adminEmailList.length === 0) {
    console.log("No ADMIN_EMAILS set - the admin screens are off.");
  } else {
    console.log(`Admin: ${adminEmailList.join(", ")}`);
  }
});

/**
 * Close the listener before the pool, so a request in flight finishes against
 * a live connection rather than failing on the way out.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  server.close();
  await disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
