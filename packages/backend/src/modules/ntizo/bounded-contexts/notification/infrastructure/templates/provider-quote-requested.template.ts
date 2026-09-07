import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: string;
  body: (service: string) => string;
  cta: string;
  disclaimer: string;
}

const PT: Copy = {
  subject: "Novo pedido de orçamento",
  heading: "Tem um pedido de orçamento por responder",
  body: (service) =>
    `Um cliente pediu orçamento para ${service}. Tem um prazo para responder com um preço, uma data e a duração do trabalho; depois disso o pedido expira.`,
  cta: "Responder ao pedido",
  disclaimer: "Recebeu este email porque faz parte de um espaço de trabalho na Ntizo que recebeu um pedido de orçamento.",
};

const EN: Copy = {
  subject: "New quote request",
  heading: "You have a quote request to answer",
  body: (service) =>
    `A customer requested a quote for ${service}. You have a deadline to answer with a price, a date and how long the work takes; after that the request expires.`,
  cta: "Respond to the request",
  disclaimer: "You are receiving this because you are part of a Ntizo workspace that received a quote request.",
};

const ES: Copy = {
  subject: "Nueva solicitud de presupuesto",
  heading: "Tienes una solicitud de presupuesto por responder",
  body: (service) =>
    `Un cliente solicitó presupuesto para ${service}. Tienes un plazo para responder con un precio, una fecha y la duración del trabajo; pasado ese plazo la solicitud caduca.`,
  cta: "Responder a la solicitud",
  disclaimer: "Recibes este mensaje porque formas parte de un espacio de trabajo en Ntizo que recibió una solicitud de presupuesto.",
};

const FR: Copy = {
  subject: "Nouvelle demande de devis",
  heading: "Vous avez une demande de devis à traiter",
  body: (service) =>
    `Un client a demandé un devis pour ${service}. Vous avez un délai pour répondre avec un prix, une date et la durée du travail ; passé ce délai, la demande expire.`,
  cta: "Répondre à la demande",
  disclaimer: "Vous recevez ce message car vous faites partie d'un espace de travail Ntizo qui a reçu une demande de devis.",
};

const IT: Copy = {
  subject: "Nuova richiesta di preventivo",
  heading: "Hai una richiesta di preventivo a cui rispondere",
  body: (service) =>
    `Un cliente ha richiesto un preventivo per ${service}. Hai una scadenza per rispondere con un prezzo, una data e la durata del lavoro; dopo la richiesta scade.`,
  cta: "Rispondi alla richiesta",
  disclaimer: "Ricevi questo messaggio perché fai parte di uno spazio di lavoro Ntizo che ha ricevuto una richiesta di preventivo.",
};

const DE: Copy = {
  subject: "Neue Angebotsanfrage",
  heading: "Sie haben eine Angebotsanfrage zu beantworten",
  body: (service) =>
    `Ein Kunde hat ein Angebot für ${service} angefragt. Sie haben eine Frist, um mit einem Preis, einem Termin und der Dauer der Arbeit zu antworten; danach läuft die Anfrage ab.`,
  cta: "Auf die Anfrage antworten",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie Teil eines Ntizo-Arbeitsbereichs sind, der eine Angebotsanfrage erhalten hat.",
};

const NL: Copy = {
  subject: "Nieuwe offerteaanvraag",
  heading: "Je hebt een offerteaanvraag om te beantwoorden",
  body: (service) =>
    `Een klant heeft een offerte aangevraagd voor ${service}. Je hebt een termijn om te reageren met een prijs, een datum en de duur van het werk; daarna vervalt de aanvraag.`,
  cta: "Reageer op de aanvraag",
  disclaimer: "Je ontvangt deze e-mail omdat je deel uitmaakt van een Ntizo-werkruimte die een offerteaanvraag heeft ontvangen.",
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
 * A customer asked one provider to price a job.
 *
 * The quote context raises `PROVIDER_QUOTE_REQUESTED` with `{ quoteId,
 * serviceName, respondBy, neededBy }`; this template reads only
 * `serviceName` — the deadline is not restated here, the workspace's own
 * quote queue shows it, the same reasoning `providerBookingReceivedTemplate`
 * gives for leaving out its own `respondBy`. `neededBy` is the customer's
 * advisory date, not a promise the provider must keep, so it stays off the
 * page that exists only to get them to respond.
 *
 * Links into `/provider`, the workspace's own queue — the request has no
 * per-quote detail page reachable from outside it yet.
 */
export const providerQuoteRequestedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const url = `${appBaseUrl()}/provider`;
    const body = c.body(service);

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
