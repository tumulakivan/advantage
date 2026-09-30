import type { Mailer } from "./types";

/**
 * Resend, over HTTPS.
 *
 * HTTPS rather than SMTP because the free web tiers that make hosting this
 * cheap block outbound SMTP ports to stop spam, and an HTTPS call to an API
 * looks like any other request. No SDK either: it is one POST, and a
 * dependency to make one POST is more to keep patched than the POST.
 *
 * Note for whoever deploys this: Resend will only deliver to addresses other
 * than the account owner's once a sending domain is verified in their
 * dashboard. Until then it works, and reaches nobody but you.
 */
export function resendMailer({ apiKey, from }: { apiKey: string; from: string }): Mailer {
  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // The body says why (unverified domain, bad key, over quota). It never
        // contains the key, so it is safe to surface.
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        throw new Error(`Resend responded ${response.status}: ${detail}`);
      }
    },
  };
}
