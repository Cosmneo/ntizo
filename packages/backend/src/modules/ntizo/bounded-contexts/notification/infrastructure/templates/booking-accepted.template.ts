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
  subject: "O prestador aceitou o seu pedido",
  heading: "O seu pedido foi aceite",
  body: (service, provider) =>
    `${provider} aceitou ${service}. O pedido de pagamento M-Pesa chega ao seu telemóvel; confirme-o antes de o prazo terminar.`,
  cta: "Ver a reserva",
  disclaimer: "Recebeu este email porque tem uma reserva na Ntizo.",
};

const EN: Copy = {
  subject: "The provider accepted your request",
  heading: "Your request was accepted",
  body: (service, provider) =>
    `${provider} accepted ${service}. The M-Pesa payment request is on its way to your phone; confirm it before the deadline passes.`,
  cta: "View the booking",
  disclaimer: "You are receiving this because you have a booking on Ntizo.",
};

const ES: Copy = {
  subject: "El prestador aceptó su solicitud",
  heading: "Su solicitud fue aceptada",
  body: (service, provider) =>
    `${provider} aceptó ${service}. La solicitud de pago M-Pesa llega a su teléfono; confírmela antes de que termine el plazo.`,
  cta: "Ver la reserva",
  disclaimer: "Recibe este mensaje porque tiene una reserva en Ntizo.",
};

const FR: Copy = {
  subject: "Le prestataire a accepté votre demande",
  heading: "Votre demande a été acceptée",
  body: (service, provider) =>
    `${provider} a accepté ${service}. La demande de paiement M-Pesa arrive sur votre téléphone ; confirmez-la avant la fin du délai.`,
  cta: "Voir la réservation",
  disclaimer: "Vous recevez ce message car vous avez une réservation sur Ntizo.",
};

const IT: Copy = {
  subject: "Il fornitore ha accettato la tua richiesta",
  heading: "La tua richiesta è stata accettata",
  body: (service, provider) =>
    `${provider} ha accettato ${service}. La richiesta di pagamento M-Pesa sta arrivando sul tuo telefono; confermala prima della scadenza.`,
  cta: "Vedi la prenotazione",
  disclaimer: "Ricevi questo messaggio perché hai una prenotazione su Ntizo.",
};

const DE: Copy = {
  subject: "Der Anbieter hat Ihre Anfrage angenommen",
  heading: "Ihre Anfrage wurde angenommen",
  body: (service, provider) =>
    `${provider} hat ${service} angenommen. Die M-Pesa-Zahlungsaufforderung erreicht gleich Ihr Telefon; bestätigen Sie sie vor Ablauf der Frist.`,
  cta: "Buchung ansehen",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie eine Buchung auf Ntizo haben.",
};

const NL: Copy = {
  subject: "De aanbieder heeft je aanvraag geaccepteerd",
  heading: "Je aanvraag is geaccepteerd",
  body: (service, provider) =>
    `${provider} heeft ${service} geaccepteerd. Het M-Pesa-betalingsverzoek komt eraan op je telefoon; bevestig het voordat de termijn verstrijkt.`,
  cta: "Bekijk de boeking",
  disclaimer: "Je ontvangt deze e-mail omdat je een boeking hebt op Ntizo.",
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
 * A provider accepted a booking request; the customer's M-Pesa charge is
 * about to land on their phone.
 *
 * The booking context raises `BOOKING_ACCEPTED` with `{ bookingId,
 * serviceName, providerName, startsAt, payBy, priceMinor, currency }`; this
 * template reads only `serviceName` and `providerName` — the amount and the
 * payment deadline are not restated here, the customer's own booking page
 * shows them, and the M-Pesa prompt itself carries the amount.
 *
 * Links into `/bookings`, the customer's own list — not a per-booking page,
 * which does not exist yet.
 */
export const bookingAcceptedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const provider = typeof payload["providerName"] === "string" ? payload["providerName"] : "";
    const url = `${appBaseUrl()}/bookings`;
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
