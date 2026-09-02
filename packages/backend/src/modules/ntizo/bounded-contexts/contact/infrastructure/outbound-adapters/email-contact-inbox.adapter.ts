import type { ContactRequestKind, ContactTopic } from "@ntizo/shared";
import { LazyEmailServiceAdapter, type EmailServicePort } from "../../../../../../shared/infrastructure/email";
import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";
import type { ContactInboxPort } from "../../app/ports/outbound/contact-inbox.port";
import type { ContactRequest } from "../../domain/aggregates/contact-request.aggregate";

/** The team reads Portuguese; these are for the subject line, not for the person who wrote. */
const KIND_LABEL: Record<ContactRequestKind, string> = {
  contact: "Contacto",
  feedback: "Feedback",
};

const TOPIC_LABEL: Record<ContactTopic, string> = {
  general: "Pergunta geral",
  partnership: "Parceria",
  press: "Imprensa",
  provider: "Sou prestador",
  other: "Outro",
  idea: "Uma ideia",
  problem: "Algo não funcionou",
  praise: "Gostei de algo",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The email the team gets. Every field, the reference, and a link to the queue.
 *
 * The stage is in the subject everywhere but prod, so a message sent from the
 * dev app into the real inbox announces itself as one.
 */
export function buildContactInboxEmail(params: {
  request: ContactRequest;
  stage: string;
  adminUrl: string;
}): { subject: string; html: string; text: string } {
  const { request, stage, adminUrl } = params;
  const tag = stage === "prod" ? "[Ntizo]" : `[Ntizo ${stage}]`;
  const subject = `${tag} ${KIND_LABEL[request.kind]}: ${TOPIC_LABEL[request.topic]} — ${request.name}`;

  const lines: Array<[string, string]> = [
    ["Referência", request.reference],
    ["Tipo", KIND_LABEL[request.kind]],
    ["Assunto", TOPIC_LABEL[request.topic]],
    ["Nome", request.name],
    ["Email", request.email ?? "(não deu)"],
    ["Idioma", request.locale],
    ["Conta", request.requesterUserId ?? "(sem sessão)"],
    ["Página", request.originPath ?? "—"],
    ["IP", request.ipAddress ?? "—"],
  ];

  const text = [
    ...lines.map(([k, v]) => `${k}: ${v}`),
    "",
    request.message,
    "",
    `Fila: ${adminUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f6f6f6;margin:0;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <h1 style="font-size:18px;font-weight:600;color:#111;margin:0 0 16px;">${escapeHtml(subject)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;color:#333;margin:0 0 16px;">
          ${lines.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#888;">${escapeHtml(k)}</td><td style="padding:2px 0;">${escapeHtml(v)}</td></tr>`).join("\n          ")}
        </table>
        <p style="font-size:14px;color:#111;line-height:1.6;white-space:pre-wrap;border-left:3px solid #006ffd;padding-left:12px;margin:0 0 24px;">${escapeHtml(request.message)}</p>
        <p style="font-size:12px;color:#888;margin:0;">Fila: <a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a></p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

export class EmailContactInboxAdapter implements ContactInboxPort {
  constructor(
    // Lazy, like the provider and notification contexts: Resend where a key
    // exists, the console adapter on a local machine.
    private readonly email: EmailServicePort = new LazyEmailServiceAdapter(),
  ) {}

  async notify(request: ContactRequest): Promise<void> {
    const env = infraStore.getEnv();
    const inbox = env.CONTACT_INBOX_EMAIL?.trim();
    if (!inbox) {
      console.warn("[contact] CONTACT_INBOX_EMAIL is not set on this stage — request stored, nobody emailed", {
        requestId: request.id,
      });
      return;
    }
    const { subject, html, text } = buildContactInboxEmail({
      request,
      stage: env.STAGE ?? "local",
      adminUrl: `${env.APP_URL}/admin/contact`,
    });
    await this.email.sendEmail({
      to: [inbox],
      subject,
      htmlBody: html,
      textBody: text,
      ...(request.email ? { replyTo: request.email } : {}),
    });
  }
}
