import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: string;
  body: (service: string, provider: string) => string;
  cta: string;
  disclaimer: string;
}

const PT: Copy = {
  subject: "O prestador não pôde aceitar o seu pedido",
  heading: "O seu pedido não foi aceite",
  body: (service, provider) =>
    `${provider} não pôde aceitar ${service}. Nada foi cobrado. Pode escolher outra hora ou outro prestador.`,
  cta: "Procurar outra hora",
  disclaimer: "Recebeu este email porque tinha um pedido de reserva na Ntizo.",
};

const EN: Copy = {
  subject: "The provider couldn't accept your request",
  heading: "Your request wasn't accepted",
  body: (service, provider) =>
    `${provider} couldn't accept ${service}. Nothing was charged. You can choose another time or another provider.`,
  cta: "Find another time",
  disclaimer: "You are receiving this because you had a booking request on Ntizo.",
};

const ES: Copy = {
  subject: "El prestador no pudo aceptar su solicitud",
  heading: "Su solicitud no fue aceptada",
  body: (service, provider) =>
    `${provider} no pudo aceptar ${service}. No se cobró nada. Puede elegir otro horario u otro prestador.`,
  cta: "Buscar otro horario",
  disclaimer: "Recibe este mensaje porque tenía una solicitud de reserva en Ntizo.",
};

const FR: Copy = {
  subject: "Le prestataire n'a pas pu accepter votre demande",
  heading: "Votre demande n'a pas été acceptée",
  body: (service, provider) =>
    `${provider} n'a pas pu accepter ${service}. Rien n'a été débité. Vous pouvez choisir un autre horaire ou un autre prestataire.`,
  cta: "Trouver un autre horaire",
  disclaimer: "Vous recevez ce message car vous aviez une demande de réservation sur Ntizo.",
};

const IT: Copy = {
  subject: "Il fornitore non ha potuto accettare la tua richiesta",
  heading: "La tua richiesta non è stata accettata",
  body: (service, provider) =>
    `${provider} non ha potuto accettare ${service}. Non è stato addebitato nulla. Puoi scegliere un altro orario o un altro fornitore.`,
  cta: "Cerca un altro orario",
  disclaimer: "Ricevi questo messaggio perché avevi una richiesta di prenotazione su Ntizo.",
};

const DE: Copy = {
  subject: "Der Anbieter konnte Ihre Anfrage nicht annehmen",
  heading: "Ihre Anfrage wurde nicht angenommen",
  body: (service, provider) =>
    `${provider} konnte ${service} nicht annehmen. Es wurde nichts abgebucht. Sie können eine andere Zeit oder einen anderen Anbieter wählen.`,
  cta: "Andere Zeit suchen",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie eine Buchungsanfrage auf Ntizo hatten.",
};

const NL: Copy = {
  subject: "De aanbieder kon je aanvraag niet accepteren",
  heading: "Je aanvraag is niet geaccepteerd",
  body: (service, provider) =>
    `${provider} kon ${service} niet accepteren. Er is niets in rekening gebracht. Je kunt een ander tijdstip of een andere aanbieder kiezen.`,
  cta: "Zoek een ander tijdstip",
  disclaimer: "Je ontvangt deze e-mail omdat je een boekingsaanvraag had op Ntizo.",
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
 * A provider declined a booking request. Nothing was charged — the request
 * never reached the payment step.
 *
 * The booking context raises `BOOKING_DECLINED` with `{ bookingId,
 * serviceName, providerName, startsAt, payBy, priceMinor, currency, reason }`;
 * this template reads only `serviceName` and `providerName`. `reason` is a
 * closed token (e.g. `outside_area`), not prose — the in-app notification
 * row is what translates it for display; printing the raw token into an
 * email would ship an untranslated code to a customer, so it is deliberately
 * left out here.
 *
 * Links into `/services`, where the customer can start over with another
 * time or another provider.
 */
export const bookingDeclinedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const provider = typeof payload["providerName"] === "string" ? payload["providerName"] : "";
    const url = `${appBaseUrl()}/services`;
    const body = c.body(service, provider);

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
