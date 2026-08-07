import { Resend } from "resend";
import { infraStore } from "../stores/infra-store";
import type { EmailMessage, EmailServicePort } from "./email-service.port";

export class ResendEmailServiceAdapter implements EmailServicePort {
  private client: Resend | null = null;

  private getClient(): Resend {
    if (!this.client) {
      const env = infraStore.getEnv();
      this.client = new Resend(env.RESEND_API_KEY);
    }
    return this.client;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    const env = infraStore.getEnv();
    const client = this.getClient();

    const { error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.htmlBody,
      text: message.textBody,
    });

    if (error) {
      throw new Error(`Resend error: ${error.name} — ${error.message}`);
    }
  }
}
