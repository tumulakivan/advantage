import type { MailMessage } from "./types";

/**
 * The three messages the service sends.
 *
 * Plain on purpose: one column, one button, no images. Image-heavy mail is
 * what spam filters distrust, and the message that matters here is "click
 * this" - everything else is in the way.
 *
 * Every interpolated value goes through `escapeHtml`. The display name is
 * whatever the person typed into the sign-up form, and the HTML body would
 * otherwise be an injection point in a message that arrives from a domain the
 * recipient trusts.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface Layout {
  greeting: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote: string;
}

function render(layout: Layout): { text: string; html: string } {
  const text = [
    layout.greeting,
    "",
    ...layout.paragraphs.flatMap((p) => [p, ""]),
    ...(layout.action ? [`${layout.action.label}:`, layout.action.url, ""] : []),
    layout.footnote,
    "",
    "- adVantage",
  ].join("\n");

  const paragraphs = layout.paragraphs
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`)
    .join("");

  const button = layout.action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(layout.action.url)}" style="background:#4d7c0f;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;display:inline-block">${escapeHtml(layout.action.label)}</a></p>` +
      `<p style="margin:0 0 14px;line-height:1.55;font-size:13px;color:#5b6660">Button not working? Paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(layout.action.url)}</span></p>`
    : "";

  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a211d">` +
    `<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;border:1px solid #dfe5e0">` +
    `<p style="margin:0 0 18px;font-size:18px;font-weight:800">adVantage</p>` +
    `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(layout.greeting)}</p>` +
    paragraphs +
    button +
    `<p style="margin:18px 0 0;line-height:1.55;font-size:13px;color:#5b6660">${escapeHtml(layout.footnote)}</p>` +
    `</div></body></html>`;

  return { text, html };
}

export function verificationEmail(input: {
  to: string;
  name: string;
  url: string;
  expiresInHours: number;
}): MailMessage {
  return {
    to: input.to,
    subject: "Confirm your email for adVantage",
    ...render({
      greeting: `Hi ${input.name},`,
      paragraphs: [
        "Confirm this address to finish creating your adVantage account.",
        `The link works for ${input.expiresInHours} hours.`,
      ],
      action: { label: "Confirm my email", url: input.url },
      footnote: "If you did not create an account, you can ignore this message. Nothing happens until the link is used.",
    }),
  };
}

export function resetPasswordEmail(input: {
  to: string;
  name: string;
  url: string;
  expiresInMinutes: number;
}): MailMessage {
  return {
    to: input.to,
    subject: "Reset your adVantage password",
    ...render({
      greeting: `Hi ${input.name},`,
      paragraphs: [
        "Someone asked to reset the password for this account. If that was you, choose a new one with the button below.",
        `The link works once, for ${input.expiresInMinutes} minutes. Using it signs you out everywhere else.`,
      ],
      action: { label: "Choose a new password", url: input.url },
      footnote: "If it was not you, ignore this message. Your password stays exactly as it is.",
    }),
  };
}

/**
 * Sent when someone signs up with an address that already has an account.
 *
 * The sign-up screen tells everyone the same thing - "check your email" - so
 * that it cannot be used to find out who has an account. The cost is that a
 * person who forgot they registered would wait for a message that never comes.
 * This is that message.
 */
export function existingAccountEmail(input: {
  to: string;
  name: string;
  signInUrl: string;
  resetUrl: string;
}): MailMessage {
  return {
    to: input.to,
    subject: "You already have an adVantage account",
    ...render({
      greeting: `Hi ${input.name},`,
      paragraphs: [
        "Someone tried to create an adVantage account with this address, but one already exists, so nothing was changed.",
        `Sign in: ${input.signInUrl}`,
        `Forgot your password? Reset it: ${input.resetUrl}`,
      ],
      footnote: "If it was not you, no action is needed.",
    }),
  };
}
