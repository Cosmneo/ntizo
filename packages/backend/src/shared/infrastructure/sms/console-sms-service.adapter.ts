import type { SmsMessage, SmsServicePort } from "./sms-service.port";

/**
 * Local-development SmsService. Prints the message to stdout instead of
 * sending it, so the phone-verification flow is self-service without a paid
 * SMS provider account.
 *
 * The OTP is pulled out and printed on its own line — that's the code you
 * type into the verification screen.
 *
 * Never select this outside STAGE=local: it silently drops real messages,
 * which for OTP means every user is permanently stuck at the code prompt.
 */
export class ConsoleSmsServiceAdapter implements SmsServicePort {
  async sendSms(message: SmsMessage): Promise<void> {
    const code = extractOtp(message.body);

    console.info(
      [
        "",
        "┌─────────────────────────────────────────────────────────────",
        "│ SMS (console adapter — nothing was actually sent)",
        `│ to   : ${message.to}`,
        `│ body : ${message.body}`,
        ...(code ? ["│", `│ code : ${code}`] : []),
        "└─────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }
}

/**
 * Pulls the numeric OTP out of a message body.
 *
 * Anchored on a run of 4-8 digits standing alone, so it does not match the
 * digits inside the recipient's own number if a template ever includes it.
 */
function extractOtp(body: string): string | undefined {
  return body.match(/(?<!\d)\d{4,8}(?!\d)/)?.[0];
}
