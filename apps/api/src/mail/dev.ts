import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Mailer } from "./types";

/**
 * Where development mail is kept, one JSON object per line.
 *
 * A file rather than an HTTP route on purpose: a route that hands out other
 * people's reset links is one misconfigured NODE_ENV away from being an account
 * takeover, and a file on the developer's own disk cannot be reached at all
 * from the network. The smoke tests read it to click the links a real inbox
 * would have received.
 */
export const OUTBOX_FILE = fileURLToPath(new URL("../../../../.mail/outbox.jsonl", import.meta.url));

/**
 * The development transport: nothing is sent. The message is printed, so the
 * link is one copy away in the terminal that is already open, and appended to
 * the outbox for tests.
 */
export const devMailer: Mailer = {
  async send(message) {
    mkdirSync(dirname(OUTBOX_FILE), { recursive: true });
    appendFileSync(OUTBOX_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`);

    const rule = "-".repeat(60);
    console.log(
      `\n${rule}\n[dev mail - not sent] to: ${message.to}\nsubject: ${message.subject}\n\n${message.text}\n${rule}\n`,
    );
  },
};
