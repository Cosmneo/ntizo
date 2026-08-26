// Provider BC email adapter. Thin wrapper around the shared Resend adapter
// that builds invitation email content. We keep the template inline (mirroring
// `shared/infrastructure/email/templates/*.ts`) until a richer template lives
// in the shared package.

import {
  type EmailMessage,
  type EmailServicePort,
  type SendResult,
  LazyEmailServiceAdapter,
} from "../../../../../../shared/infrastructure/email";

export class ProviderEmailServiceAdapter implements EmailServicePort {
  constructor(
        // Lazy, so the adapter is chosen from the request's env on each send —
    // Resend where a key exists, the console adapter on a local machine. It
    // used to construct a Resend client unconditionally, which is why every
    // invitation failed locally while verification emails printed fine.
    private readonly inner: EmailServicePort = new LazyEmailServiceAdapter(),
  ) {}

  async sendEmail(message: EmailMessage): Promise<SendResult> {
    return this.inner.sendEmail(message);
  }
}

export function buildProviderInviteEmail(params: {
  providerName: string;
  inviterName: string;
  acceptUrl: string;
  token: string;
}): { subject: string; html: string; text: string } {
  const subject = `You've been invited to join ${params.providerName} on Ntizo`;
  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f6f6f6;margin:0;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <h1 style="font-size:20px;font-weight:600;color:#111;margin:0 0 16px;">You're invited to ${params.providerName}</h1>
        <p style="font-size:14px;color:#333;line-height:1.5;">
          ${params.inviterName} has invited you to join <strong>${params.providerName}</strong> on Ntizo.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
          <tr>
            <td align="center" bgcolor="#006ffd" style="border-radius:8px;">
              <a href="${params.acceptUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;">Accept invite</a>
            </td>
          </tr>
        </table>
        <p style="font-size:12px;color:#888;">Or use this token in the app: <code>${params.token}</code></p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
        <p style="font-size:12px;color:#888;margin:0;">If you weren't expecting this invitation, you can safely ignore this email.</p>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `${params.inviterName} invited you to join ${params.providerName} on Ntizo.
Accept: ${params.acceptUrl}
Token: ${params.token}`;
  return { subject, html, text };
}
