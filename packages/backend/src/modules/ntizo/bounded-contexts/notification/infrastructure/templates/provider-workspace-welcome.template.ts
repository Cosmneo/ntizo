import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: "Your Ntizo workspace is ready",
  heading: "Your workspace is ready",
  body: "You can now manage your services, availability and bookings from here.",
  cta: "Go to your dashboard",
  disclaimer: "You are receiving this because a provider workspace was created with this address.",
};

const PT: Copy = {
  subject: "O seu espaço de trabalho na Ntizo está pronto",
  heading: "O seu espaço de trabalho está pronto",
  body: "Já pode gerir os seus serviços, a sua disponibilidade e as suas reservas a partir daqui.",
  cta: "Aceder ao seu painel",
  disclaimer: "Recebeu esta mensagem porque foi criado um espaço de trabalho de prestador com este endereço.",
};

const ES: Copy = {
  subject: "Tu espacio de trabajo en Ntizo está listo",
  heading: "Tu espacio de trabajo está listo",
  body: "Ya puedes gestionar tus servicios, tu disponibilidad y tus reservas desde aquí.",
  cta: "Ir a tu panel",
  disclaimer: "Recibes este mensaje porque se creó un espacio de trabajo de proveedor con esta dirección.",
};

const FR: Copy = {
  subject: "Votre espace Ntizo est prêt",
  heading: "Votre espace de travail est prêt",
  body: "Vous pouvez désormais gérer vos prestations, vos disponibilités et vos réservations depuis ici.",
  cta: "Accéder à votre tableau de bord",
  disclaimer: "Vous recevez ce message car un espace prestataire a été créé avec cette adresse.",
};

const IT: Copy = {
  subject: "Il tuo spazio di lavoro su Ntizo è pronto",
  heading: "Il tuo spazio di lavoro è pronto",
  body: "Ora puoi gestire i tuoi servizi, la tua disponibilità e le tue prenotazioni da qui.",
  cta: "Vai alla tua dashboard",
  disclaimer: "Ricevi questo messaggio perché è stato creato uno spazio fornitore con questo indirizzo.",
};

const DE: Copy = {
  subject: "Ihr Ntizo-Arbeitsbereich ist bereit",
  heading: "Ihr Arbeitsbereich ist bereit",
  body: "Sie können jetzt Ihre Leistungen, Ihre Verfügbarkeit und Ihre Buchungen von hier aus verwalten.",
  cta: "Zum Dashboard",
  disclaimer: "Sie erhalten diese Nachricht, weil mit dieser Adresse ein Anbieter-Arbeitsbereich erstellt wurde.",
};

const NL: Copy = {
  subject: "Je Ntizo-werkruimte is klaar",
  heading: "Je werkruimte is klaar",
  body: "Je kunt nu je diensten, je beschikbaarheid en je boekingen vanaf hier beheren.",
  cta: "Naar je dashboard",
  disclaimer: "Je ontvangt dit bericht omdat er een aanbieder-werkruimte is aangemaakt met dit adres.",
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
 * A provider workspace finished setting up.
 *
 * Deliberately does not name the business: `provider.created` carries no
 * name to begin with (see `registerProviderNotificationHandlers`'s docblock),
 * and every row raised with `audience: "provider"` lands inside the one
 * workspace it is about — the reader is already inside it. Naming it would
 * need a lookup that does not exist for this event, unlike `team-invitation`,
 * which addresses a personal inbox and must name the workspace it is for.
 *
 * `payload.type` (`"individual" | "organization"`) is snapshotted by the
 * handler for a future split greeting, but this message reads the same for
 * both today — hence the unused second parameter below.
 */
export const providerWorkspaceWelcomeTemplate: TemplateModule = {
  render(locale, _payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const dashboardUrl = `${appBaseUrl()}/provider`;

    return {
      subject: c.subject,
      html: emailLayout({
        heading: c.heading,
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body)}</p>${buttonHtml(dashboardUrl, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading}\n\n${c.body}\n\n${dashboardUrl}`,
    };
  },
};
