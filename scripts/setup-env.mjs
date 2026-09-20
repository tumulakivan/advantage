import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Create `.env` from `.env.example` on a first run, with a real session secret
 * already in it.
 *
 * Generating the secret by hand is the step most likely to be skipped or done
 * badly, and the failure it causes - a service that starts and then cannot
 * verify anyone's session - is far from its cause. Better to write one here
 * than to leave `replace-me` in a file and hope.
 *
 * It never overwrites an existing `.env`.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const target = `${root}.env`;
const template = `${root}.env.example`;

if (existsSync(target)) {
  console.log(".env already exists - leaving it alone.");
  process.exit(0);
}

if (!existsSync(template)) {
  console.error("No .env.example to copy from.");
  process.exit(1);
}

copyFileSync(template, target);

const secret = randomBytes(32).toString("base64");
const contents = readFileSync(target, "utf8").replace(
  /^BETTER_AUTH_SECRET=.*$/m,
  `BETTER_AUTH_SECRET="${secret}"`,
);
writeFileSync(target, contents);

console.log("Wrote .env with a freshly generated BETTER_AUTH_SECRET.");
