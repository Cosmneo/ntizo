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
  subject: "A sua proposta foi aceite",
  heading: "O cliente aceitou a sua proposta",
  body: (service) =>
    `O cliente aceitou a sua proposta para ${service} e o pagamento M-Pesa está a caminho. A reserva fica confirmada assim que o pagamento entrar.`,
  cta: "Ver o espaço de trabalho",
  disclaimer: "Recebeu este email porque faz parte de um espaço de trabalho na Ntizo com uma proposta aceite.",
};

const EN: Copy = {
  subject: "Your quote was accepted",
  heading: "The customer accepted your quote",
  body: (service) =>
    `The customer accepted your quote for ${service} and the M-Pesa payment is on its way. The booking is confirmed once the payment comes through.`,
  cta: "Go to your workspace",
  disclaimer: "You are receiving this because you are part of a Ntizo workspace with an accepted quote.",
};

const ES: Copy = {
  subject: "Tu propuesta fue aceptada",
  heading: "El cliente aceptó tu propuesta",
  body: (service) =>
    `El cliente aceptó tu propuesta para ${service} y el pago por M-Pesa está en camino. La reserva queda confirmada en cuanto se reciba el pago.`,
  cta: "Ir a tu espacio de trabajo",
  disclaimer: "Recibes este mensaje porque formas parte de un espacio de trabajo en Ntizo con una propuesta aceptada.",
};

const FR: Copy = {
  subject: "Votre devis a été accepté",
  heading: "Le client a accepté votre devis",
  body: (service) =>
    `Le client a accepté votre devis pour ${service} et le paiement M-Pesa est en cours. La réservation est confirmée dès que le paiement arrive.`,
  cta: "Accéder à votre espace de travail",
  disclaimer: "Vous recevez ce message car vous faites partie d'un espace de travail Ntizo avec un devis accepté.",
};

const IT: Copy = {
  subject: "Il tuo preventivo è stato accettato",
  heading: "Il cliente ha accettato il tuo preventivo",
  body: (service) =>
    `Il cliente ha accettato il tuo preventivo per ${service} e il pagamento M-Pesa è in arrivo. La prenotazione viene confermata non appena arriva il pagamento.`,
  cta: "Vai al tuo spazio di lavoro",
  disclaimer: "Ricevi questo messaggio perché fai parte di uno spazio di lavoro Ntizo con un preventivo accettato.",
};

const DE: Copy = {
  subject: "Ihr Angebot wurde angenommen",
  heading: "Der Kunde hat Ihr Angebot angenommen",
  body: (service) =>
    `Der Kunde hat Ihr Angebot für ${service} angenommen, und die M-Pesa-Zahlung ist unterwegs. Die Buchung wird bestätigt, sobald die Zahlung eingeht.`,
  cta: "Zum Arbeitsbereich",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie Teil eines Ntizo-Arbeitsbereichs mit einem angenommenen Angebot sind.",
};

const NL: Copy = {
  subject: "Je offerte is geaccepteerd",
  heading: "De klant heeft je offerte geaccepteerd",
  body: (service) =>
    `De klant heeft je offerte voor ${service} geaccepteerd en de M-Pesa-betaling is onderweg. De boeking wordt bevestigd zodra de betaling binnenkomt.`,
  cta: "Naar je werkruimte",
  disclaimer: "Je ontvangt deze e-mail omdat je deel uitmaakt van een Ntizo-werkruimte met een geaccepteerde offerte.",
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
 * The provider's own proposal was accepted; a booking now exists and the
 * customer's M-Pesa charge is in flight.
 *
 * The quote context raises `PROVIDER_QUOTE_ACCEPTED` with `{ quoteId,
 * bookingId, serviceName, priceMinor, currency, startsAt }`; this template
 * reads only `serviceName` — the price and the date are what the provider
 * themselves proposed, not news, the same reasoning `quoteAcceptedTemplate`
 * gives for leaving its own amount out.
 *
 * Links into `/provider`, the workspace this booking now belongs to.
 */
export const providerQuoteAcceptedTemplate: TemplateModule = {
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
