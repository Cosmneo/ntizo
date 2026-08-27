import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: "You have a new message on Ntizo",
  heading: "New message",
  body: "You have an unread message waiting. Reply to keep the conversation going.",
  cta: "View messages",
  disclaimer: "You are receiving this because you have an unanswered conversation on Ntizo.",
};

const PT: Copy = {
  subject: "Tem uma mensagem nova na Ntizo",
  heading: "Mensagem nova",
  body: "Recebeu uma mensagem que ainda não foi lida. Responda para continuar a conversa.",
  cta: "Ver mensagens",
  disclaimer: "Recebe esta mensagem porque tem uma conversa por responder na Ntizo.",
};

const ES: Copy = {
  subject: "Tienes un mensaje nuevo en Ntizo",
  heading: "Mensaje nuevo",
  body: "Tienes un mensaje sin leer esperando. Responde para continuar la conversación.",
  cta: "Ver mensajes",
  disclaimer: "Recibes este mensaje porque tienes una conversación sin responder en Ntizo.",
};

const FR: Copy = {
  subject: "Vous avez un nouveau message sur Ntizo",
  heading: "Nouveau message",
  body: "Un message non lu vous attend. Répondez pour continuer la conversation.",
  cta: "Voir les messages",
  disclaimer: "Vous recevez ce message car une conversation reste sans réponse sur Ntizo.",
};

const IT: Copy = {
  subject: "Hai un nuovo messaggio su Ntizo",
  heading: "Nuovo messaggio",
  body: "Hai un messaggio non letto in attesa. Rispondi per continuare la conversazione.",
  cta: "Vedi i messaggi",
  disclaimer: "Ricevi questo messaggio perché hai una conversazione senza risposta su Ntizo.",
};

const DE: Copy = {
  subject: "Sie haben eine neue Nachricht auf Ntizo",
  heading: "Neue Nachricht",
  body: "Eine ungelesene Nachricht wartet auf Sie. Antworten Sie, um das Gespräch fortzusetzen.",
  cta: "Nachrichten ansehen",
  disclaimer: "Sie erhalten diese Nachricht, weil ein Gespräch auf Ntizo noch unbeantwortet ist.",
};

const NL: Copy = {
  subject: "Je hebt een nieuw bericht op Ntizo",
  heading: "Nieuw bericht",
  body: "Er wacht een ongelezen bericht op je. Reageer om het gesprek voort te zetten.",
  cta: "Bekijk berichten",
  disclaimer: "Je ontvangt dit bericht omdat je een onbeantwoord gesprek hebt op Ntizo.",
};

// Exported so templates.test.ts can assert on the table directly.
// pickCopy() falls back gracefully (exact locale, then language-only,
// then English) — a table silently missing a key would still render,
// quietly in English, and "renders in every locale" would not catch it.
export const BY_LOCALE: Record<string, Copy> = {
  "en-US": EN,
  "pt-MZ": PT,
  "pt-PT": PT,
  "es-ES": ES,
  "fr-FR": FR,
  "it-IT": IT,
  "de-DE": DE,
  "nl-NL": NL,
};

/**
 * A message sat unread past its window — Task 5's sweep in the Communication
 * context (`NotifyUnreadInternalCommand`) is this template's only producer.
 *
 * Receives `{ threadId }` and does not use it. There is no thread-specific
 * page to deep-link into yet — `/messages` is a placeholder route on the web
 * app — so the CTA goes to the general inbox rather than a URL nothing can
 * resolve. Wire `threadId` into the link the day that route exists; the
 * payload already carries it for exactly that.
 *
 * One template regardless of which side gets it: `NotifyUnreadInternalCommand`
 * raises this for whichever side did not send the message, but the payload it
 * hands over does not say which — only `threadId` — so the copy is written to
 * read correctly whether the recipient is the customer or a provider team
 * member, rather than branching on an audience this template is never told.
 */
export const newMessageTemplate: TemplateModule = {
  render(locale, _payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const messagesUrl = `${appBaseUrl()}/messages`;

    return {
      subject: c.subject,
      html: emailLayout({
        heading: c.heading,
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body)}</p>${buttonHtml(messagesUrl, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading}\n\n${c.body}\n\n${messagesUrl}`,
    };
  },
};
