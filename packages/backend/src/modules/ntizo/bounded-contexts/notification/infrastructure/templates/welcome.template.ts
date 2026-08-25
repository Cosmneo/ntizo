import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: (firstName: string | null) => string;
  body: string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: "Welcome to Ntizo",
  // `firstName` is nullable all the way from the database: better-auth
  // defaults it to "" and the sign-up command normalises that to null, so a
  // greeting must read without it rather than say "Welcome, !".
  heading: (n) => (n ? `Welcome, ${n}` : "Welcome to Ntizo"),
  body: "Your account is ready. Find someone for the job, or start offering your own services.",
  cta: "Explore Ntizo",
  disclaimer: "You are receiving this because an account was created with this address.",
};

const PT: Copy = {
  subject: "Bem-vindo à Ntizo",
  heading: (n) => (n ? `Bem-vindo, ${n}` : "Bem-vindo à Ntizo"),
  body: "A sua conta está pronta. Encontre quem faça o trabalho, ou comece a oferecer os seus próprios serviços.",
  cta: "Explorar a Ntizo",
  disclaimer: "Recebeu esta mensagem porque foi criada uma conta com este endereço.",
};

const ES: Copy = {
  subject: "Bienvenido a Ntizo",
  heading: (n) => (n ? `Bienvenido, ${n}` : "Bienvenido a Ntizo"),
  body: "Tu cuenta está lista. Encuentra a alguien para el trabajo, o empieza a ofrecer tus propios servicios.",
  cta: "Explorar Ntizo",
  disclaimer: "Recibes este mensaje porque se creó una cuenta con esta dirección.",
};

const FR: Copy = {
  subject: "Bienvenue sur Ntizo",
  heading: (n) => (n ? `Bienvenue, ${n}` : "Bienvenue sur Ntizo"),
  body: "Votre compte est prêt. Trouvez quelqu'un pour le travail, ou commencez à proposer vos propres services.",
  cta: "Découvrir Ntizo",
  disclaimer: "Vous recevez ce message car un compte a été créé avec cette adresse.",
};

const IT: Copy = {
  subject: "Benvenuto su Ntizo",
  heading: (n) => (n ? `Benvenuto, ${n}` : "Benvenuto su Ntizo"),
  body: "Il tuo account è pronto. Trova qualcuno per il lavoro, o inizia a offrire i tuoi servizi.",
  cta: "Esplora Ntizo",
  disclaimer: "Ricevi questo messaggio perché è stato creato un account con questo indirizzo.",
};

const DE: Copy = {
  subject: "Willkommen bei Ntizo",
  heading: (n) => (n ? `Willkommen, ${n}` : "Willkommen bei Ntizo"),
  body: "Ihr Konto ist bereit. Finden Sie jemanden für die Arbeit, oder bieten Sie Ihre eigenen Leistungen an.",
  cta: "Ntizo entdecken",
  disclaimer: "Sie erhalten diese Nachricht, weil mit dieser Adresse ein Konto erstellt wurde.",
};

const NL: Copy = {
  subject: "Welkom bij Ntizo",
  heading: (n) => (n ? `Welkom, ${n}` : "Welkom bij Ntizo"),
  body: "Je account is klaar. Vind iemand voor de klus, of begin met het aanbieden van je eigen diensten.",
  cta: "Ntizo verkennen",
  disclaimer: "Je ontvangt dit bericht omdat er een account is aangemaakt met dit adres.",
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
 * Somebody finished signing up.
 *
 * pt-MZ and pt-PT share one Copy deliberately: nothing in this message differs
 * between them, and two identical tables would be two places to fix one typo.
 * They are separate keys so a future divergence is a one-line change here
 * rather than a restructure.
 */
export const welcomeTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const rawFirstName = typeof payload["firstName"] === "string" ? payload["firstName"] : null;

    // `firstName` is typed by the person signing up, and `c.heading(...)`
    // lands directly inside `emailLayout`'s `<h1>` — `emailLayout` interpolates
    // `heading` raw, with no escaping of its own (see layout.ts). Escaped once,
    // here, at the point it enters the template — the same point
    // `team-invitation.template.ts` escapes `providerName`, for the same
    // reason. `Copy.heading` builds our own words around the name, so escaping
    // its *result* instead would mangle punctuation we wrote ourselves; escape
    // the value, not the sentence.
    const safeFirstName = rawFirstName ? escapeHtml(rawFirstName) : null;
    const appUrl = appBaseUrl();

    return {
      subject: c.subject,
      html: emailLayout({
        heading: c.heading(safeFirstName),
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body)}</p>${buttonHtml(appUrl, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading(rawFirstName)}\n\n${c.body}\n\n${appUrl}`,
    };
  },
};
