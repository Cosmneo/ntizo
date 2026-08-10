export interface SmsMessage {
  /** Recipient in E.164 form (`+258841234567`). Providers reject anything else. */
  to: string;
  body: string;
}

export interface SmsServicePort {
  sendSms(message: SmsMessage): Promise<void>;
}
