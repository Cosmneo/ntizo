import { Resend } from "resend";
import { infraStore } from "../stores/infra-store";
import type { EmailMessage, EmailServicePort, SendResult } from "./email-service.port";

export class ResendEmailServiceAdapter implements EmailServicePort {
  private client: Resend | null = null;

  private getClient(): Resend {
    if (!this.client) {
      const env = infraStore.getEnv();
      this.client = new Resend(env.RESEND_API_KEY);
    }
    return this.client;
  }

  async sendEmail(message: EmailMessage): Promise<SendResult> {
    const env = infraStore.getEnv();
    const client = this.getClient();

    const { data, error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.htmlBody,
      text: message.textBody,
    });

    if (error) {
      throw new Error(`Resend error: ${error.name} — ${error.message}`);
    }

    // The id is what a bounce webhook arrives carrying, and the only way back
    // from "this address bounced" to "this is what we sent it".
    return { messageId: data?.id ?? null };
  }
}
