import type { EmailMessage, EmailServicePort } from "./email-service.port";

/**
 * Local-development EmailService. Prints the message to stdout instead of
 * sending it, so signup / password-reset flows are self-service without a
 * Resend account or a verified sending domain.
 *
 * Any URL found in the body is printed on its own line — that's the
 * verification / reset link you paste into the browser.
 *
 * Never select this outside STAGE=local: it silently drops real mail.
 */
export class ConsoleEmailServiceAdapter implements EmailServicePort {
  async sendEmail(message: EmailMessage): Promise<void> {
    const links = extractUrls(message.textBody ?? message.htmlBody);

    console.info(
      [
        "",
        "┌─────────────────────────────────────────────────────────────",
        "│ EMAIL (console adapter — nothing was actually sent)",
        `│ to      : ${message.to.join(", ")}`,
        `│ subject : ${message.subject}`,
        ...(links.length
          ? ["│", ...links.map((l) => `│ link    : ${l}`)]
          : ["│ (no links found in body)"]),
        "└─────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }
}

/** Pulls http(s) URLs out of a body, de-duplicated, in first-seen order. */
function extractUrls(body: string): string[] {
  const matches = body.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  return [...new Set(matches.map((url) => url.replace(/&amp;/g, "&")))];
}
