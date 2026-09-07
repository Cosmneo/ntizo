import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  disclaimer: string;
}

const PT: Copy = {
  subject: "O prestador não vai fazer este trabalho",
  heading: "O prestador não vai avançar com o seu pedido",
  body: "Nada foi cobrado. Pode pedir orçamento a outro prestador para o mesmo trabalho.",
  cta: "Ver o pedido",
  disclaimer: "Recebeu este email porque tinha um pedido de orçamento na Ntizo.",
};

const EN: Copy = {
  subject: "The provider isn't doing this job",
  heading: "The provider won't be taking on your request",
  body: "Nothing was charged. You can ask another provider for a quote on the same job.",
  cta: "View the request",
  disclaimer: "You are receiving this because you had a quote request on Ntizo.",
};

const ES: Copy = {
  subject: "El prestador no va a hacer este trabajo",
  heading: "El prestador no va a atender tu solicitud",
  body: "No se cobró nada. Puedes pedir presupuesto a otro prestador para el mismo trabajo.",
  cta: "Ver la solicitud",
  disclaimer: "Recibes este mensaje porque tenías una solicitud de presupuesto en Ntizo.",
};

const FR: Copy = {
  subject: "Le prestataire ne fera pas ce travail",
  heading: "Le prestataire n'accepte pas votre demande",
  body: "Rien n'a été débité. Vous pouvez demander un devis à un autre prestataire pour le même travail.",
  cta: "Voir la demande",
  disclaimer: "Vous recevez ce message car vous aviez une demande de devis sur Ntizo.",
};

const IT: Copy = {
  subject: "Il fornitore non farà questo lavoro",
  heading: "Il fornitore non prenderà in carico la tua richiesta",
  body: "Non è stato addebitato nulla. Puoi chiedere un preventivo a un altro fornitore per lo stesso lavoro.",
  cta: "Vedi la richiesta",
  disclaimer: "Ricevi questo messaggio perché avevi una richiesta di preventivo su Ntizo.",
};

const DE: Copy = {
  subject: "Der Anbieter übernimmt diesen Auftrag nicht",
  heading: "Der Anbieter nimmt Ihre Anfrage nicht an",
  body: "Es wurde nichts abgebucht. Sie können bei einem anderen Anbieter ein Angebot für denselben Auftrag anfragen.",
  cta: "Anfrage ansehen",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie eine Angebotsanfrage auf Ntizo hatten.",
};

const NL: Copy = {
  subject: "De aanbieder gaat deze klus niet doen",
  heading: "De aanbieder neemt je aanvraag niet aan",
  body: "Er is niets in rekening gebracht. Je kunt bij een andere aanbieder een offerte aanvragen voor dezelfde klus.",
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
 * The provider said no — from either open state, a request they will not
 * price or a proposal they are taking back (`DeclineQuoteCommand` covers
 * both; from the customer's side they are the same news).
 *
 * The quote context raises `QUOTE_DECLINED` with `{ quoteId, reason, note }`;
 * this template reads neither. `reason` is a closed token from
 * `QUOTE_PROVIDER_DECLINE_REASONS` (not prose — the in-app row is what
 * translates it for display, the same reasoning `bookingDeclinedTemplate`
 * gives for its own `reason`), and `note` is the provider's free text, kept
 * out of the email for the same reason `supportReplyTemplate` never inlines
 * a reply's body: the app is where you read what somebody wrote, the email
 * only says to go look. No `serviceName` is sent for this type, so the copy
 * below is written to need none.
 *
 * Links into `/quotes/${quoteId}`, the request's own page.
 */
export const quoteDeclinedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const quoteId = typeof payload["quoteId"] === "string" ? payload["quoteId"] : "";
    const url = `${appBaseUrl()}/quotes/${quoteId}`;

    return {
      subject: c.subject,
      html: emailLayout({
        heading: c.heading,
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body)}</p>${buttonHtml(url, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading}\n\n${c.body}\n\n${url}`,
    };
  },
};
