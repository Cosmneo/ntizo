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
  subject: "Proposta aceite — confirme o pagamento",
  heading: "A sua proposta foi aceite",
  body: (service) =>
    `Aceitou a proposta para ${service}. O pedido de pagamento M-Pesa chega ao seu telemóvel; tem 15 minutos para o confirmar antes de a vaga ser libertada.`,
  cta: "Ver a reserva",
  disclaimer: "Recebeu este email porque aceitou uma proposta na Ntizo.",
};

const EN: Copy = {
  subject: "Quote accepted — confirm the payment",
  heading: "Your quote was accepted",
  body: (service) =>
    `You accepted the quote for ${service}. The M-Pesa payment request is on its way to your phone; you have 15 minutes to confirm it before the slot is released.`,
  cta: "View the booking",
  disclaimer: "You are receiving this because you accepted a quote on Ntizo.",
};

const ES: Copy = {
  subject: "Propuesta aceptada: confirma el pago",
  heading: "Tu propuesta fue aceptada",
  body: (service) =>
    `Aceptaste la propuesta para ${service}. La solicitud de pago M-Pesa llega a tu teléfono; tienes 15 minutos para confirmarla antes de que se libere el horario.`,
  cta: "Ver la reserva",
  disclaimer: "Recibes este mensaje porque aceptaste una propuesta en Ntizo.",
};

const FR: Copy = {
  subject: "Devis accepté — confirmez le paiement",
  heading: "Votre devis a été accepté",
  body: (service) =>
    `Vous avez accepté le devis pour ${service}. La demande de paiement M-Pesa arrive sur votre téléphone ; vous avez 15 minutes pour la confirmer avant que le créneau ne soit libéré.`,
  cta: "Voir la réservation",
  disclaimer: "Vous recevez ce message car vous avez accepté un devis sur Ntizo.",
};

const IT: Copy = {
  subject: "Preventivo accettato — conferma il pagamento",
  heading: "Il tuo preventivo è stato accettato",
  body: (service) =>
    `Hai accettato il preventivo per ${service}. La richiesta di pagamento M-Pesa sta arrivando sul tuo telefono; hai 15 minuti per confermarla prima che lo slot venga liberato.`,
  cta: "Vedi la prenotazione",
  disclaimer: "Ricevi questo messaggio perché hai accettato un preventivo su Ntizo.",
};

const DE: Copy = {
  subject: "Angebot angenommen — Zahlung bestätigen",
  heading: "Ihr Angebot wurde angenommen",
  body: (service) =>
    `Sie haben das Angebot für ${service} angenommen. Die M-Pesa-Zahlungsaufforderung erreicht gleich Ihr Telefon; Sie haben 15 Minuten, um sie zu bestätigen, bevor der Termin wieder freigegeben wird.`,
  cta: "Buchung ansehen",
  disclaimer: "Sie erhalten diese E-Mail, weil Sie ein Angebot auf Ntizo angenommen haben.",
};

const NL: Copy = {
  subject: "Offerte geaccepteerd — bevestig de betaling",
  heading: "Je offerte is geaccepteerd",
  body: (service) =>
    `Je hebt de offerte voor ${service} geaccepteerd. Het M-Pesa-betalingsverzoek komt eraan op je telefoon; je hebt 15 minuten om het te bevestigen voordat de plek weer vrijkomt.`,
  cta: "Bekijk de boeking",
  disclaimer: "Je ontvangt deze e-mail omdat je een offerte hebt geaccepteerd op Ntizo.",
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
 * The customer's own accept just fired the M-Pesa prompt. Accepting is
 * paying — `AcceptQuoteCommand`'s one act — so this confirms it worked and
 * points at the booking it created, in case the phone prompt is missed.
 *
 * The quote context raises `QUOTE_ACCEPTED` with `{ quoteId, bookingId,
 * serviceName, priceMinor, currency, payBy }`; this template reads only
 * `serviceName` and `bookingId`. The amount is not restated — the customer
 * just set it in motion themselves, the same reasoning `bookingAcceptedTemplate`
 * gives for leaving its own price and deadline to the booking page.
 *
 * Links into `/bookings/${bookingId}`, the booking this acceptance created.
 */
export const quoteAcceptedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const bookingId = typeof payload["bookingId"] === "string" ? payload["bookingId"] : "";
    const url = `${appBaseUrl()}/bookings/${bookingId}`;
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
