import { describe, expect, it } from "bun:test";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import type { EmailMessage, EmailServicePort, SendResult } from "../../../../../shared/infrastructure/email";
import { ContactRequest } from "../domain/aggregates/contact-request.aggregate";
import { buildContactInboxEmail, EmailContactInboxAdapter } from "../infrastructure/outbound-adapters/email-contact-inbox.adapter";

class CapturingEmail implements EmailServicePort {
  sent: EmailMessage[] = [];
  async sendEmail(message: EmailMessage): Promise<SendResult> {
    this.sent.push(message);
    return { messageId: "m-1" };
  }
}

const BASE_ENV = {
  STAGE: "dev" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "",
  BETTER_AUTH_SECRET: "x",
  RESEND_API_KEY: "",
  EMAIL_FROM: "Ntizo <noreply@ntizo.co.mz>",
  APP_URL: "https://dev.ntizo.co.mz",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

function stored(over: Partial<Parameters<typeof ContactRequest.create>[0]> = {}) {
  return ContactRequest.create({
    kind: "contact",
    topic: "general",
    name: "Joana Matola",
    email: "joana@exemplo.com",
    message: "Gostava de propor uma parceria com a minha escola.\n<b>não é html</b>",
    locale: "pt-MZ",
    originPath: "/contact",
    requesterUserId: "u-1",
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...over,
  }).withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");
}

describe("EmailContactInboxAdapter", () => {
  it("sends to the configured inbox with the requester as reply-to", async () => {
    const email = new CapturingEmail();
    await infraStore.runAsync({ ...BASE_ENV, CONTACT_INBOX_EMAIL: "ola@ntizo.co.mz" }, async () => {
      await new EmailContactInboxAdapter(email).notify(stored());
    });
    expect(email.sent).toHaveLength(1);
    const m = email.sent[0]!;
    expect(m.to).toEqual(["ola@ntizo.co.mz"]);
    expect(m.replyTo).toBe("joana@exemplo.com");
    expect(m.subject).toBe("[Ntizo dev] Contacto: Pergunta geral — Joana Matola");
    expect(m.textBody).toContain("Referência: 7F3A2C");
    expect(m.textBody).toContain("https://dev.ntizo.co.mz/admin/contact");
    expect(m.htmlBody).toContain("&lt;b&gt;não é html&lt;/b&gt;");
  });

  it("omits reply-to when the person gave no email, and drops the stage tag on prod", async () => {
    const email = new CapturingEmail();
    await infraStore.runAsync({ ...BASE_ENV, STAGE: "prod", CONTACT_INBOX_EMAIL: "ola@ntizo.co.mz" }, async () => {
      await new EmailContactInboxAdapter(email).notify(stored({ kind: "feedback", topic: "idea", email: null }));
    });
    const m = email.sent[0]!;
    expect(m.replyTo).toBeUndefined();
    expect(m.subject).toBe("[Ntizo] Feedback: Uma ideia — Joana Matola");
  });

  it("sends nothing, and does not throw, when no inbox is configured", async () => {
    const email = new CapturingEmail();
    await infraStore.runAsync({ ...BASE_ENV }, async () => {
      await new EmailContactInboxAdapter(email).notify(stored());
    });
    expect(email.sent).toEqual([]);
  });

  it("builds a subject from the kind and topic labels the team reads in", () => {
    const { subject } = buildContactInboxEmail({ request: stored({ kind: "contact", topic: "press" }), stage: "qa", adminUrl: "x" });
    expect(subject).toBe("[Ntizo qa] Contacto: Imprensa — Joana Matola");
  });
});
