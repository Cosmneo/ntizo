import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { escapeHtml, pickCopy, type TemplateModule } from "./copy";
import { adminRequestUrl, subjectOf } from "./support-links";

interface Copy {
  subject: (s: string) => string;
  heading: string;
  body: (s: string) => string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: (s) => `New support request: ${s}`,
  heading: "New support request",
  body: (s) => `Somebody opened a support request: "${s}". It is waiting in the queue.`,
  cta: "Open the request",
  disclaimer: "You are receiving this because you administer Ntizo.",
};

const PT: Copy = {
  subject: (s) => `Novo pedido de suporte: ${s}`,
  heading: "Novo pedido de suporte",
  body: (s) => `Alguém abriu um pedido de suporte: «${s}». Está à espera na fila.`,
  cta: "Abrir o pedido",
  disclaimer: "Recebe esta mensagem porque administra a Ntizo.",
};

const ES: Copy = {
  subject: (s) => `Nueva solicitud de soporte: ${s}`,
  heading: "Nueva solicitud de soporte",
  body: (s) => `Alguien abrió una solicitud de soporte: «${s}». Está esperando en la cola.`,
  cta: "Abrir la solicitud",
  disclaimer: "Recibes este mensaje porque administras Ntizo.",
};

const FR: Copy = {
  subject: (s) => `Nouvelle demande d'assistance : ${s}`,
  heading: "Nouvelle demande d'assistance",
  body: (s) => `Quelqu'un a ouvert une demande d'assistance : « ${s} ». Elle attend dans la file.`,
  cta: "Ouvrir la demande",
  disclaimer: "Vous recevez ce message car vous administrez Ntizo.",
};

const IT: Copy = {
  subject: (s) => `Nuova richiesta di assistenza: ${s}`,
  heading: "Nuova richiesta di assistenza",
  body: (s) => `Qualcuno ha aperto una richiesta di assistenza: «${s}». È in attesa nella coda.`,
  cta: "Apri la richiesta",
  disclaimer: "Ricevi questo messaggio perché amministri Ntizo.",
};

const DE: Copy = {
  subject: (s) => `Neue Supportanfrage: ${s}`,
  heading: "Neue Supportanfrage",
  body: (s) => `Jemand hat eine Supportanfrage geöffnet: „${s}“. Sie wartet in der Warteschlange.`,
  cta: "Anfrage öffnen",
  disclaimer: "Sie erhalten diese Nachricht, weil Sie Ntizo administrieren.",
};

const NL: Copy = {
  subject: (s) => `Nieuw supportverzoek: ${s}`,
  heading: "Nieuw supportverzoek",
  body: (s) => `Iemand heeft een supportverzoek geopend: "${s}". Het wacht in de wachtrij.`,
  cta: "Verzoek openen",
  disclaimer: "Je ontvangt dit bericht omdat je Ntizo beheert.",
};

export const BY_LOCALE: Record<string, Copy> = {
  "en-US": EN, "pt-MZ": PT, "pt-PT": PT, "es-ES": ES, "fr-FR": FR, "it-IT": IT, "de-DE": DE, "nl-NL": NL,
};

/** Raised by `OpenSupportRequestCommand`, once per admin, the moment a request is opened. */
export const supportRequestOpenedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const subject = subjectOf(payload);
    const url = adminRequestUrl(payload);
    return {
      subject: c.subject(subject),
      html: emailLayout({
        heading: c.heading,
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body(subject))}</p>${buttonHtml(url, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading}\n\n${c.body(subject)}\n\n${url}`,
    };
  },
};
