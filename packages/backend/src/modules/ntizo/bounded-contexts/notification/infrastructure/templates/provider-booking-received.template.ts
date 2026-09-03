import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: string;
  body: (service: string, who: string) => string;
  cta: string;
  disclaimer: string;
  nobody: string;
}

const PT: Copy = {
  subject: "Novo pedido de reserva na Ntizo",
  heading: "Tem um pedido por responder",
  body: (service, who) => `${who} pediu ${service}. Tem um prazo para aceitar ou recusar; depois disso o pedido expira.`,
  cta: "Responder ao pedido",
  disclaimer: "Recebeu este email porque faz parte de um espaço de trabalho na Ntizo que recebeu um pedido.",
  nobody: "Um cliente",
};

const EN: Copy = {
  subject: "New booking request on Ntizo",
  heading: "You have a request to answer",
  body: (service, who) => `${who} requested ${service}. You have a deadline to accept or decline; after that the request expires.`,
  cta: "Respond to the request",
  disclaimer: "You are receiving this because you are part of a Ntizo workspace that received a request.",
  nobody: "A customer",
};

const ES: Copy = {
  subject: "Nueva solicitud de reserva en Ntizo",
  heading: "Tienes una solicitud por responder",
  body: (service, who) => `${who} solicitó ${service}. Tienes un plazo para aceptar o rechazar; pasado ese plazo la solicitud caduca.`,
  cta: "Responder a la solicitud",
  disclaimer: "Recibes este mensaje porque formas parte de un espacio de trabajo en Ntizo que recibió una solicitud.",
  nobody: "Un cliente",
};

const FR: Copy = {
  subject: "Nouvelle demande de réservation sur Ntizo",
  heading: "Vous avez une demande à traiter",
  body: (service, who) => `${who} a demandé ${service}. Vous avez un délai pour accepter ou refuser ; passé ce délai, la demande expire.`,
  cta: "Répondre à la demande",
  disclaimer: "Vous recevez ce message car vous faites partie d'un espace de travail Ntizo qui a reçu une demande.",
  nobody: "Un client",
};

const IT: Copy = {
  subject: "Nuova richiesta di prenotazione su Ntizo",
  heading: "Hai una richiesta a cui rispondere",
  body: (service, who) => `${who} ha richiesto ${service}. Hai una scadenza entro cui accettare o rifiutare; dopo la richiesta scade.`,
  cta: "Rispondi alla richiesta",
  disclaimer: "Ricevi questo messaggio perché fai parte di uno spazio di lavoro Ntizo che ha ricevuto una richiesta.",
  nobody: "Un cliente",
};

const DE: Copy = {
  subject: "Neue Buchungsanfrage auf Ntizo",
  heading: "Sie haben eine Anfrage zu beantworten",
  body: (service, who) => `${who} hat ${service} angefragt. Sie haben eine Frist, um anzunehmen oder abzulehnen; danach läuft die Anfrage ab.`,
  cta: "Auf die Anfrage antworten",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie Teil eines Ntizo-Arbeitsbereichs sind, der eine Anfrage erhalten hat.",
  nobody: "Ein Kunde",
};

const NL: Copy = {
  subject: "Nieuwe boekingsaanvraag op Ntizo",
  heading: "Je hebt een aanvraag om te beantwoorden",
  body: (service, who) => `${who} heeft ${service} aangevraagd. Je hebt een termijn om te accepteren of te weigeren; daarna vervalt de aanvraag.`,
  cta: "Reageer op de aanvraag",
  disclaimer: "Je ontvangt deze e-mail omdat je deel uitmaakt van een Ntizo-werkruimte die een aanvraag heeft ontvangen.",
  nobody: "Een klant",
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
 * A booking request landed in a provider workspace's queue, unanswered.
 *
 * The booking context raises `PROVIDER_BOOKING_RECEIVED` with `{ bookingId,
 * serviceName, startsAt, timezone, customerFirstName, respondBy }`; this
 * template reads only `serviceName` and `customerFirstName` — the deadline
 * itself is not restated here, the workspace's own request view shows it.
 *
 * Links into `/provider`, not a specific booking's detail page: the
 * workspace's request queue is where accepting or declining actually
 * happens, and that page does not exist per-booking yet.
 */
export const providerBookingReceivedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const who =
      typeof payload["customerFirstName"] === "string" && payload["customerFirstName"]
        ? payload["customerFirstName"]
        : c.nobody;
    const url = `${appBaseUrl()}/provider`;
    const body = c.body(service, who);

    return {
      subject: c.subject,
      html: emailLayout({
        heading: c.heading,
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(body)}</p>${buttonHtml(url, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading}\n\n${body}\n\n${url}`,
    };
  },
};
