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
  subject: (s) => `New message on a support request: ${s}`,
  heading: "New message on a support request",
  body: (s) => `The requester wrote again on "${s}" and nobody has read it yet.`,
  cta: "Open the request",
  disclaimer: "You are receiving this because you administer Ntizo.",
};

const PT: Copy = {
  subject: (s) => `Nova mensagem num pedido de suporte: ${s}`,
  heading: "Nova mensagem num pedido de suporte",
  body: (s) => `O requerente escreveu de novo em «${s}» e ainda ninguém leu.`,
  cta: "Abrir o pedido",
  disclaimer: "Recebe esta mensagem porque administra a Ntizo.",
};

const ES: Copy = {
  subject: (s) => `Nuevo mensaje en una solicitud de soporte: ${s}`,
  heading: "Nuevo mensaje en una solicitud de soporte",
  body: (s) => `El solicitante escribió de nuevo en «${s}» y todavía nadie lo ha leído.`,
  cta: "Abrir la solicitud",
  disclaimer: "Recibes este mensaje porque administras Ntizo.",
};

const FR: Copy = {
  subject: (s) => `Nouveau message sur une demande d'assistance : ${s}`,
  heading: "Nouveau message sur une demande d'assistance",
  body: (s) => `Le demandeur a écrit de nouveau sur « ${s} » et personne ne l'a encore lu.`,
  cta: "Ouvrir la demande",
  disclaimer: "Vous recevez ce message car vous administrez Ntizo.",
};

const IT: Copy = {
  subject: (s) => `Nuovo messaggio su una richiesta di assistenza: ${s}`,
  heading: "Nuovo messaggio su una richiesta di assistenza",
  body: (s) => `Il richiedente ha scritto di nuovo su «${s}» e nessuno l'ha ancora letto.`,
  cta: "Apri la richiesta",
  disclaimer: "Ricevi questo messaggio perché amministri Ntizo.",
};

const DE: Copy = {
  subject: (s) => `Neue Nachricht zu einer Supportanfrage: ${s}`,
  heading: "Neue Nachricht zu einer Supportanfrage",
  body: (s) => `Der Anfragende hat erneut zu „${s}“ geschrieben, und noch niemand hat es gelesen.`,
  cta: "Anfrage öffnen",
  disclaimer: "Sie erhalten diese Nachricht, weil Sie Ntizo administrieren.",
};

const NL: Copy = {
  subject: (s) => `Nieuw bericht bij een supportverzoek: ${s}`,
  heading: "Nieuw bericht bij een supportverzoek",
  body: (s) => `De aanvrager heeft opnieuw geschreven over "${s}" en niemand heeft het nog gelezen.`,
  cta: "Verzoek openen",
  disclaimer: "Je ontvangt dit bericht omdat je Ntizo beheert.",
};

export const BY_LOCALE: Record<string, Copy> = {
  "en-US": EN, "pt-MZ": PT, "pt-PT": PT, "es-ES": ES, "fr-FR": FR, "it-IT": IT, "de-DE": DE, "nl-NL": NL,
};

/** Raised by `NotifyUnreadInternalCommand`, once per admin, when a requester's message sits unread past its window. */
export const supportRequestMessageTemplate: TemplateModule = {
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
