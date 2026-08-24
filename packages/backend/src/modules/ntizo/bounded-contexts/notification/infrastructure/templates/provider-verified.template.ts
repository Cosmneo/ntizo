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
  subject: "You're verified — your business is now listed",
  heading: "You're verified",
  body: "Your documents were accepted. Customers can now find and book your services on Ntizo.",
  cta: "Go to your dashboard",
  disclaimer: "You are receiving this because your verification status changed.",
};

const PT: Copy = {
  subject: "Foi verificado — o seu negócio já está listado",
  heading: "Foi verificado",
  body: "Os seus documentos foram aceites. Os clientes já podem encontrar e reservar os seus serviços na Ntizo.",
  cta: "Aceder ao seu painel",
  disclaimer: "Recebeu esta mensagem porque o estado da sua verificação mudou.",
};

const ES: Copy = {
  subject: "Verificación aprobada: tu negocio ya aparece en Ntizo",
  heading: "Verificación aprobada",
  body: "Tus documentos fueron aceptados. Los clientes ya pueden encontrar y reservar tus servicios en Ntizo.",
  cta: "Ir a tu panel",
  disclaimer: "Recibes este mensaje porque cambió el estado de tu verificación.",
};

const FR: Copy = {
  subject: "Vérification approuvée : votre activité est désormais visible",
  heading: "Vérification approuvée",
  body: "Vos documents ont été acceptés. Les clients peuvent désormais trouver et réserver vos prestations sur Ntizo.",
  cta: "Accéder à votre tableau de bord",
  disclaimer: "Vous recevez ce message car l'état de votre vérification a changé.",
};

const IT: Copy = {
  subject: "Verifica approvata: la tua attività è ora visibile",
  heading: "Verifica approvata",
  body: "I tuoi documenti sono stati accettati. I clienti possono ora trovare e prenotare i tuoi servizi su Ntizo.",
  cta: "Vai alla tua dashboard",
  disclaimer: "Ricevi questo messaggio perché lo stato della tua verifica è cambiato.",
};

const DE: Copy = {
  subject: "Verifizierung abgeschlossen — Ihr Unternehmen ist jetzt gelistet",
  heading: "Verifizierung abgeschlossen",
  body: "Ihre Unterlagen wurden akzeptiert. Kunden können Ihre Leistungen jetzt auf Ntizo finden und buchen.",
  cta: "Zum Dashboard",
  disclaimer: "Sie erhalten diese Nachricht, weil sich Ihr Verifizierungsstatus geändert hat.",
};

const NL: Copy = {
  subject: "Verificatie goedgekeurd — je bedrijf is nu zichtbaar",
  heading: "Verificatie goedgekeurd",
  body: "Je documenten zijn geaccepteerd. Klanten kunnen je diensten nu vinden en boeken op Ntizo.",
  cta: "Naar je dashboard",
  disclaimer: "Je ontvangt dit bericht omdat je verificatiestatus is gewijzigd.",
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
 * A provider's documents were accepted and the business is now listed.
 *
 * Receives `{ from, to }` and uses neither. Which template ran is what says
 * the outcome — this one only runs when `provider.status.decided` moves a
 * provider `to: "active"` (see `registerProviderNotificationHandlers` in
 * `provider.event-handlers.ts`) — so the copy below is written for that one
 * outcome directly, rather than branching on the payload. Do not thread
 * `from`/`to` into the copy: the moment this template needs to say something
 * different for a different transition, it stops being this template.
 */
export const providerVerifiedTemplate: TemplateModule = {
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
