import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: (revision: boolean) => string;
  heading: (revision: boolean) => string;
  body: (service: string, amount: string) => string;
  cta: string;
  disclaimer: string;
}

const PT: Copy = {
  subject: (revision) => (revision ? "A proposta foi actualizada" : "Recebeu uma proposta"),
  heading: (revision) => (revision ? "Nova proposta do prestador" : "Já tem uma proposta"),
  body: (service, amount) =>
    `O prestador respondeu ao seu pedido de ${service} com ${amount}, uma data e a duração do trabalho. Veja os detalhes e decida antes de a proposta expirar.`,
  cta: "Ver a proposta",
  disclaimer: "Recebeu este email porque pediu um orçamento na Ntizo.",
};

const EN: Copy = {
  subject: (revision) => (revision ? "The quote was updated" : "You have a quote"),
  heading: (revision) => (revision ? "A new quote from the provider" : "Your quote has arrived"),
  body: (service, amount) =>
    `The provider answered your request for ${service} with ${amount}, a date and how long the work takes. Look it over and decide before it expires.`,
  cta: "View the quote",
  disclaimer: "You are receiving this because you asked for a quote on Ntizo.",
};

const ES: Copy = {
  subject: (revision) => (revision ? "Se actualizó la propuesta" : "Recibiste una propuesta"),
  heading: (revision) => (revision ? "Nueva propuesta del prestador" : "Ya tienes una propuesta"),
  body: (service, amount) =>
    `El prestador respondió a tu solicitud de ${service} con ${amount}, una fecha y la duración del trabajo. Revisa los detalles y decide antes de que la propuesta caduque.`,
  cta: "Ver la propuesta",
  disclaimer: "Recibes este mensaje porque solicitaste un presupuesto en Ntizo.",
};

const FR: Copy = {
  subject: (revision) => (revision ? "Le devis a été mis à jour" : "Vous avez un devis"),
  heading: (revision) => (revision ? "Nouveau devis du prestataire" : "Votre devis est arrivé"),
  body: (service, amount) =>
    `Le prestataire a répondu à votre demande de ${service} avec ${amount}, une date et la durée du travail. Consultez les détails et décidez avant l'expiration du devis.`,
  cta: "Voir le devis",
  disclaimer: "Vous recevez ce message car vous avez demandé un devis sur Ntizo.",
};

const IT: Copy = {
  subject: (revision) => (revision ? "Il preventivo è stato aggiornato" : "Hai ricevuto un preventivo"),
  heading: (revision) => (revision ? "Nuovo preventivo dal fornitore" : "Il tuo preventivo è arrivato"),
  body: (service, amount) =>
    `Il fornitore ha risposto alla tua richiesta di ${service} con ${amount}, una data e la durata del lavoro. Controlla i dettagli e decidi prima che il preventivo scada.`,
  cta: "Vedi il preventivo",
  disclaimer: "Ricevi questo messaggio perché hai richiesto un preventivo su Ntizo.",
};

const DE: Copy = {
  subject: (revision) => (revision ? "Das Angebot wurde aktualisiert" : "Sie haben ein Angebot erhalten"),
  heading: (revision) => (revision ? "Neues Angebot vom Anbieter" : "Ihr Angebot ist da"),
  body: (service, amount) =>
    `Der Anbieter hat auf Ihre Anfrage für ${service} mit ${amount}, einem Termin und der Dauer der Arbeit geantwortet. Prüfen Sie die Details und entscheiden Sie, bevor das Angebot abläuft.`,
  cta: "Angebot ansehen",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie ein Angebot auf Ntizo angefragt haben.",
};

const NL: Copy = {
  subject: (revision) => (revision ? "De offerte is bijgewerkt" : "Je hebt een offerte ontvangen"),
  heading: (revision) => (revision ? "Nieuwe offerte van de aanbieder" : "Je offerte is binnen"),
  body: (service, amount) =>
    `De aanbieder heeft op je aanvraag voor ${service} gereageerd met ${amount}, een datum en de duur van het werk. Bekijk de details en beslis voordat de offerte verloopt.`,
  cta: "Bekijk de offerte",
  disclaimer: "Je ontvangt deze e-mail omdat je een offerte hebt aangevraagd op Ntizo.",
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
 * The provider priced the job. Carries the amount, because unlike a booking
 * acceptance this is the first time the customer learns what it costs — the
 * whole point of the quote path.
 *
 * The quote context raises `QUOTE_RECEIVED` with `{ quoteId, serviceName,
 * priceMinor, currency, startsAt, validUntil, revision }`; this template
 * reads `serviceName`, `priceMinor`, `currency` and `revision` — not
 * `startsAt`/`validUntil`, the quote's own page shows the date and the
 * countdown. `revision` distinguishes the first proposal from one that
 * superseded an earlier one (see `ProposeQuoteCommand`'s `wasProposed`),
 * which changes the subject and heading but not the body's shape.
 *
 * Links into `/quotes/${quoteId}`, where the customer decides.
 */
export const quoteReceivedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const revision = payload["revision"] === true;
    const priceMinor = typeof payload["priceMinor"] === "number" ? payload["priceMinor"] : 0;
    const currency = typeof payload["currency"] === "string" ? payload["currency"] : "MZN";
    const amount = `${(priceMinor / 100).toLocaleString(locale)} ${currency}`;
    const quoteId = typeof payload["quoteId"] === "string" ? payload["quoteId"] : "";
    const url = `${appBaseUrl()}/quotes/${quoteId}`;
    const body = c.body(service, amount);

    return {
      subject: c.subject(revision),
      html: emailLayout({
        heading: c.heading(revision),
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(body)}</p>${buttonHtml(url, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading(revision)}\n\n${body}\n\n${url}`,
    };
  },
};
