import { env } from "../env";
import { devMailer } from "./dev";
import { resendMailer } from "./resend";
import type { MailMessage, Mailer } from "./types";

/**
 * Chosen once, at boot, from configuration. `env.ts` has already refused to
 * start if production is pointed at the development transport or if the real
 * one is missing what it needs, so there is no fallback to write here and no
 * way to reach one by accident.
 */
const mailer: Mailer =
  env.MAIL_TRANSPORT === "resend"
    ? resendMailer({ apiKey: env.RESEND_API_KEY ?? "", from: env.MAIL_FROM ?? "" })
    : devMailer;

/**
 * Send a message without letting the outcome reach the caller.
 *
 * This is deliberately not awaited by the auth callbacks that use it. A sign-up
 * that returns after the mail provider answers takes measurably longer for an
 * address that exists than for one that does not, and that difference is an
 * account-enumeration oracle. It also means a provider outage is a logged
 * error rather than a failed sign-up - the person can ask for another link.
 */
export function deliver(message: MailMessage): void {
  mailer.send(message).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Could not send "${message.subject}" - ${reason}`);
  });
}
