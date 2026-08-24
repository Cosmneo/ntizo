export interface EmailMessage {
  to: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface SendResult {
  /**
   * The provider's own id for this message, when it gives one.
   *
   * Null from the console adapter, which sends nothing — and a delivery
   * recorded against it is genuinely a delivery with no provider id, not a
   * missing value to paper over.
   */
  messageId: string | null;
}

export interface EmailServicePort {
  sendEmail(message: EmailMessage): Promise<SendResult>;
}
