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
  subject: "O pedido de orçamento expirou",
  heading: "O prestador não respondeu a tempo",
  body: (service) =>
    `O seu pedido de orçamento para ${service} expirou porque o prestador não respondeu dentro do prazo. Pode pedir orçamento a outro prestador.`,
  cta: "Ver o pedido",
  disclaimer: "Recebeu este email porque tinha um pedido de orçamento na Ntizo.",
};

const EN: Copy = {
  subject: "The quote request expired",
  heading: "The provider didn't respond in time",
  body: (service) =>
    `Your quote request for ${service} expired because the provider didn't respond within the deadline. You can ask another provider for a quote.`,
  cta: "View the request",
  disclaimer: "You are receiving this because you had a quote request on Ntizo.",
};

const ES: Copy = {
  subject: "La solicitud de presupuesto caducó",
  heading: "El prestador no respondió a tiempo",
  body: (service) =>
    `Tu solicitud de presupuesto para ${service} caducó porque el prestador no respondió dentro del plazo. Puedes pedir presupuesto a otro prestador.`,
  cta: "Ver la solicitud",
  disclaimer: "Recibes este mensaje porque tenías una solicitud de presupuesto en Ntizo.",
};

const FR: Copy = {
  subject: "La demande de devis a expiré",
  heading: "Le prestataire n'a pas répondu à temps",
  body: (service) =>
    `Votre demande de devis pour ${service} a expiré car le prestataire n'a pas répondu dans les délais. Vous pouvez demander un devis à un autre prestataire.`,
  cta: "Voir la demande",
  disclaimer: "Vous recevez ce message car vous aviez une demande de devis sur Ntizo.",
};

const IT: Copy = {
  subject: "La richiesta di preventivo è scaduta",
  heading: "Il fornitore non ha risposto in tempo",
  body: (service) =>
    `La tua richiesta di preventivo per ${service} è scaduta perché il fornitore non ha risposto entro la scadenza. Puoi chiedere un preventivo a un altro fornitore.`,
  cta: "Vedi la richiesta",
  disclaimer: "Ricevi questo messaggio perché avevi una richiesta di preventivo su Ntizo.",
};

const DE: Copy = {
  subject: "Die Angebotsanfrage ist abgelaufen",
  heading: "Der Anbieter hat nicht rechtzeitig geantwortet",
  body: (service) =>
    `Ihre Angebotsanfrage für ${service} ist abgelaufen, weil der Anbieter nicht innerhalb der Frist geantwortet hat. Sie können bei einem anderen Anbieter ein Angebot anfragen.`,
  cta: "Anfrage ansehen",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie eine Angebotsanfrage auf Ntizo hatten.",
};

const NL: Copy = {
  subject: "De offerteaanvraag is verlopen",
  heading: "De aanbieder heeft niet op tijd gereageerd",
  body: (service) =>
    `Je offerteaanvraag voor ${service} is verlopen omdat de aanbieder niet binnen de termijn heeft gereageerd. Je kunt bij een andere aanbieder een offerte aanvragen.`,
  cta: "Bekijk de aanvraag",
  disclaimer: "Je ontvangt deze e-mail omdat je een offerteaanvraag had op Ntizo.",
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
 * The provider's own clock ran out on a `REQUESTED` quote before it was ever
 * priced. `SweepQuoteCommand` names this cause `provider_did_not_respond`
 * and it is the only cause this type ever carries — the other cause,
 * `proposal_lapsed`, tells the provider instead, as `PROVIDER_QUOTE_EXPIRED`,
 * which is deliberately unregistered.
 *
 * The quote context raises `QUOTE_EXPIRED` with `{ quoteId, serviceName,
 * cause }`; this template reads `serviceName` but not `cause` — it is a
 * closed token, and with a single possible value here the copy just says
 * what happened directly instead of branching on it.
 *
 * Links into `/quotes/${quoteId}`, the request's own page.
 */
export const quoteExpiredTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const quoteId = typeof payload["quoteId"] === "string" ? payload["quoteId"] : "";
    const url = `${appBaseUrl()}/quotes/${quoteId}`;
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
