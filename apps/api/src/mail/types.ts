/** One outgoing message. Both bodies, because a mail client may want either. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The only thing the rest of the service knows about email: hand it a message.
 * Which provider carries it is decided once, in `mail/index.ts`, so swapping
 * one for another is a new file here and a line there.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
