export interface EmailMessage {
  to: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface EmailServicePort {
  sendEmail(message: EmailMessage): Promise<void>;
}
