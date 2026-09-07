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
  subject: "A hora proposta já não está livre",
  heading: "Precisa de enviar uma nova proposta",
  body: (service) =>
    `A hora que propôs para ${service} deixou de estar livre. Tem um novo prazo para enviar outra proposta antes que o pedido expire.`,
  cta: "Enviar nova proposta",
  disclaimer: "Recebeu este email porque faz parte de um espaço de trabalho na Ntizo com um pedido de orçamento em aberto.",
};

const EN: Copy = {
  subject: "The proposed time is no longer free",
  heading: "You need to send a new quote",
  body: (service) =>
    `The time you proposed for ${service} is no longer free. You have a new deadline to send another quote before the request expires.`,
  cta: "Send a new quote",
  disclaimer: "You are receiving this because you are part of a Ntizo workspace with an open quote request.",
};

const ES: Copy = {
  subject: "El horario propuesto ya no está libre",
  heading: "Tienes que enviar una nueva propuesta",
  body: (service) =>
    `El horario que propusiste para ${service} ya no está libre. Tienes un nuevo plazo para enviar otra propuesta antes de que la solicitud caduque.`,
  cta: "Enviar nueva propuesta",
  disclaimer: "Recibes este mensaje porque formas parte de un espacio de trabajo en Ntizo con una solicitud de presupuesto abierta.",
};

const FR: Copy = {
  subject: "Le créneau proposé n'est plus libre",
  heading: "Vous devez envoyer un nouveau devis",
  body: (service) =>
    `Le créneau que vous avez proposé pour ${service} n'est plus libre. Vous avez un nouveau délai pour envoyer un autre devis avant l'expiration de la demande.`,
  cta: "Envoyer un nouveau devis",
  disclaimer: "Vous recevez ce message car vous faites partie d'un espace de travail Ntizo avec une demande de devis ouverte.",
};

const IT: Copy = {
  subject: "L'orario proposto non è più libero",
  heading: "Devi inviare un nuovo preventivo",
  body: (service) =>
    `L'orario che hai proposto per ${service} non è più libero. Hai una nuova scadenza per inviare un altro preventivo prima che la richiesta scada.`,
  cta: "Invia un nuovo preventivo",
  disclaimer: "Ricevi questo messaggio perché fai parte di uno spazio di lavoro Ntizo con una richiesta di preventivo aperta.",
};

const DE: Copy = {
  subject: "Der vorgeschlagene Termin ist nicht mehr frei",
  heading: "Sie müssen ein neues Angebot senden",
  body: (service) =>
    `Der von Ihnen vorgeschlagene Termin für ${service} ist nicht mehr frei. Sie haben eine neue Frist, um ein weiteres Angebot zu senden, bevor die Anfrage abläuft.`,
  cta: "Neues Angebot senden",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie Teil eines Ntizo-Arbeitsbereichs mit einer offenen Angebotsanfrage sind.",
};

const NL: Copy = {
  subject: "Het voorgestelde tijdstip is niet meer vrij",
  heading: "Je moet een nieuwe offerte sturen",
  body: (service) =>
    `Het tijdstip dat je hebt voorgesteld voor ${service} is niet meer vrij. Je hebt een nieuwe termijn om een andere offerte te sturen voordat de aanvraag vervalt.`,
  cta: "Nieuwe offerte sturen",
  disclaimer: "Je ontvangt deze e-mail omdat je deel uitmaakt van een Ntizo-werkruimte met een open offerteaanvraag.",
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
 * The customer's accept lost the exclusion-constraint race: some other
 * booking already holds that slot. `MarkProposalStaleInternalCommand` puts
 * the quote back in front of the provider, `PROPOSED` reset to open, with a
 * fresh response window.
 *
 * The quote context raises `PROVIDER_QUOTE_SLOT_TAKEN` with `{ quoteId,
 * serviceName, respondBy }`; this template reads only `serviceName` — the
 * new deadline is not restated, the workspace's own queue shows it, the same
 * reasoning `providerQuoteRequestedTemplate` gives for its own `respondBy`.
 *
 * Links into `/provider`, where the provider proposes again.
 */
export const providerQuoteSlotTakenTemplate: TemplateModule = {
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
