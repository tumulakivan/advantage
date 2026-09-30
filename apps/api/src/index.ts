import { createApp } from "./app";
import { disconnect, prisma } from "./db/client";
import { adminEmailList, env } from "./env";

/**
 * Sign-in requires a confirmed address, and this is what makes that true of
 * sessions that predate the rule rather than only of new ones.
 *
 * Without it, an account created before verification existed - including one
 * registered with somebody else's address - would keep a valid login for the
 * rest of its 30 days. After this, the only way to hold a session is to have
 * gone through a flow that proves the mailbox, so it is an invariant rather
 * than a hope. It is a no-op on a fresh database, which is where a deployment
 * starts.
 */
try {
  const { count } = await prisma.session.deleteMany({ where: { user: { emailVerified: false } } });
  if (count > 0) {
    console.log(`Signed out ${count} session(s) belonging to unverified accounts.`);
  }
} catch (error) {
  // The database not being up is reported properly on the first real query.
  console.warn(`Could not check sessions for unverified accounts - ${String(error).split("\n")[0]}`);
}

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
