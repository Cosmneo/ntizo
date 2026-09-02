import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { escapeHtml, pickCopy, type TemplateModule } from "./copy";
import { requesterThreadUrl, subjectOf } from "./support-links";

interface Copy {
  subject: (s: string) => string;
  heading: string;
  body: (s: string) => string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: (s) => `Ntizo Support replied: ${s}`,
  heading: "Support replied",
  body: (s) => `Ntizo Support answered your request "${s}". Open it to read the reply.`,
  cta: "Read the reply",
  disclaimer: "You are receiving this because you have an open support request on Ntizo.",
};

const PT: Copy = {
  subject: (s) => `O Suporte Ntizo respondeu: ${s}`,
  heading: "O suporte respondeu",
  body: (s) => `O Suporte Ntizo respondeu ao seu pedido «${s}». Abra-o para ler a resposta.`,
  cta: "Ler a resposta",
  disclaimer: "Recebe esta mensagem porque tem um pedido de suporte aberto na Ntizo.",
};

const ES: Copy = {
  subject: (s) => `El Soporte de Ntizo respondió: ${s}`,
  heading: "El soporte respondió",
  body: (s) => `El Soporte de Ntizo respondió a tu solicitud «${s}». Ábrela para leer la respuesta.`,
  cta: "Leer la respuesta",
  disclaimer: "Recibes este mensaje porque tienes una solicitud de soporte abierta en Ntizo.",
};

const FR: Copy = {
  subject: (s) => `Le support Ntizo a répondu : ${s}`,
  heading: "Le support a répondu",
  body: (s) => `Le support Ntizo a répondu à votre demande « ${s} ». Ouvrez-la pour lire la réponse.`,
  cta: "Lire la réponse",
  disclaimer: "Vous recevez ce message car vous avez une demande d'assistance ouverte sur Ntizo.",
};

const IT: Copy = {
  subject: (s) => `Il supporto Ntizo ha risposto: ${s}`,
  heading: "Il supporto ha risposto",
  body: (s) => `Il supporto Ntizo ha risposto alla tua richiesta «${s}». Aprila per leggere la risposta.`,
  cta: "Leggi la risposta",
  disclaimer: "Ricevi questo messaggio perché hai una richiesta di assistenza aperta su Ntizo.",
};

const DE: Copy = {
  subject: (s) => `Der Ntizo-Support hat geantwortet: ${s}`,
  heading: "Der Support hat geantwortet",
  body: (s) => `Der Ntizo-Support hat auf Ihre Anfrage „${s}“ geantwortet. Öffnen Sie sie, um die Antwort zu lesen.`,
  cta: "Antwort lesen",
  disclaimer: "Sie erhalten diese Nachricht, weil Sie eine offene Supportanfrage bei Ntizo haben.",
};

const NL: Copy = {
  subject: (s) => `Ntizo Support heeft geantwoord: ${s}`,
  heading: "Support heeft geantwoord",
  body: (s) => `Ntizo Support heeft geantwoord op je verzoek "${s}". Open het om de reactie te lezen.`,
  cta: "Lees de reactie",
  disclaimer: "Je ontvangt dit bericht omdat je een open supportverzoek hebt bij Ntizo.",
};

export const BY_LOCALE: Record<string, Copy> = {
  "en-US": EN, "pt-MZ": PT, "pt-PT": PT, "es-ES": ES, "fr-FR": FR, "it-IT": IT, "de-DE": DE, "nl-NL": NL,
};

/** Raised by `NotifyUnreadInternalCommand` when the platform's reply on a support request sat unread past its window. */
export const supportReplyTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const subject = subjectOf(payload);
    const url = requesterThreadUrl(payload);
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
