import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: (providerName: string) => string;
  heading: (providerName: string) => string;
  body: (providerName: string, role: string) => string;
  cta: string;
  disclaimer: string;
  roles: Record<string, string>;
  /** Stands in for the business name when the lookup that names it misses. */
  unnamedWorkspace: string;
}

const EN: Copy = {
  subject: (p) => `You've been invited to join ${p} on Ntizo`,
  heading: (p) => `You've been invited to join ${p}`,
  body: (p, r) => `You've been invited to join ${p} as ${r}. Sign in to accept and get started.`,
  cta: "Sign in",
  disclaimer: "You are receiving this because someone invited this address to a workspace on Ntizo.",
  roles: { owner: "owner", admin: "administrator", staff: "team member" },
  unnamedWorkspace: "a workspace",
};

const PT: Copy = {
  subject: (p) => `Foi convidado para ${p} na Ntizo`,
  heading: (p) => `Foi convidado para ${p}`,
  body: (p, r) => `Foi convidado para ${p} como ${r}. Inicie sessão para aceitar e começar.`,
  cta: "Iniciar sessão",
  disclaimer: "Recebeu esta mensagem porque este endereço foi convidado para um espaço de trabalho na Ntizo.",
  roles: { owner: "proprietário", admin: "administrador", staff: "colaborador" },
  unnamedWorkspace: "um espaço de trabalho",
};

const ES: Copy = {
  subject: (p) => `Has sido invitado a ${p} en Ntizo`,
  heading: (p) => `Has sido invitado a ${p}`,
  body: (p, r) => `Has sido invitado a ${p} como ${r}. Inicia sesión para aceptar y empezar.`,
  cta: "Iniciar sesión",
  disclaimer: "Recibes este mensaje porque esta dirección fue invitada a un espacio de trabajo en Ntizo.",
  roles: { owner: "propietario", admin: "administrador", staff: "personal" },
  unnamedWorkspace: "un espacio de trabajo",
};

const FR: Copy = {
  subject: (p) => `Vous avez été invité à rejoindre ${p} sur Ntizo`,
  heading: (p) => `Vous avez été invité à rejoindre ${p}`,
  body: (p, r) => `Vous avez été invité à rejoindre ${p} en tant que ${r}. Connectez-vous pour accepter et commencer.`,
  cta: "Se connecter",
  disclaimer: "Vous recevez ce message car cette adresse a été invitée à un espace de travail sur Ntizo.",
  roles: { owner: "propriétaire", admin: "administrateur", staff: "équipier" },
  unnamedWorkspace: "un espace de travail",
};

const IT: Copy = {
  subject: (p) => `Sei stato invitato a ${p} su Ntizo`,
  heading: (p) => `Sei stato invitato a ${p}`,
  body: (p, r) => `Sei stato invitato a ${p} come ${r}. Accedi per accettare e iniziare.`,
  cta: "Accedi",
  disclaimer: "Ricevi questo messaggio perché questo indirizzo è stato invitato a uno spazio di lavoro su Ntizo.",
  roles: { owner: "proprietario", admin: "amministratore", staff: "collaboratore" },
  unnamedWorkspace: "uno spazio di lavoro",
};

const DE: Copy = {
  subject: (p) => `Sie wurden zu ${p} auf Ntizo eingeladen`,
  heading: (p) => `Sie wurden zu ${p} eingeladen`,
  body: (p, r) => `Sie wurden als ${r} zu ${p} eingeladen. Melden Sie sich an, um anzunehmen und loszulegen.`,
  cta: "Anmelden",
  disclaimer: "Sie erhalten diese Nachricht, weil diese Adresse zu einem Arbeitsbereich auf Ntizo eingeladen wurde.",
  roles: { owner: "Inhaber", admin: "Administrator", staff: "Mitarbeiter" },
  unnamedWorkspace: "einem Arbeitsbereich",
};

const NL: Copy = {
  subject: (p) => `Je bent uitgenodigd voor ${p} op Ntizo`,
  heading: (p) => `Je bent uitgenodigd voor ${p}`,
  body: (p, r) => `Je bent uitgenodigd voor ${p} als ${r}. Log in om te accepteren en te beginnen.`,
  cta: "Inloggen",
  disclaimer: "Je ontvangt dit bericht omdat dit adres is uitgenodigd voor een werkruimte op Ntizo.",
  roles: { owner: "eigenaar", admin: "beheerder", staff: "medewerker" },
  unnamedWorkspace: "een werkruimte",
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
 * Somebody invited this address to a workspace.
 *
 * This is the one template of the five that names the business:
 * `provider.invite.sent` addresses a *personal* inbox — one person can belong
 * to several workspaces — and `providerName` is exactly what
 * `registerProviderNotificationHandlers` snapshots for that reason (see its
 * docblock in `provider.event-handlers.ts`). `provider-workspace-welcome`
 * does the opposite for the opposite reason: it lands inside the one
 * workspace it is about, so naming it would be narrating what the reader is
 * already looking at.
 *
 * `providerNameReader.findNameById` can return `null` — a race with the
 * workspace being deleted, or read-replica lag — and that must not suppress
 * the invitation, so a missing name falls back to a generic phrase rather
 * than failing the render.
 */
export const teamInvitationTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const rawName =
      typeof payload["providerName"] === "string" && payload["providerName"].length > 0
        ? payload["providerName"]
        : c.unnamedWorkspace;
    const role = typeof payload["role"] === "string" ? payload["role"] : "staff";
    // Looked up in our own dictionary, so `roleWord` is safe today — but the
    // lookup has a fallback to the raw payload string (`?? role`), and
    // `TemplateRendererPort` documents `payload` as unconstrained by design.
    // Escaped for the same reason `providerName` is: not because the closed
    // `"admin" | "staff"` union upstream can reach it now, but because
    // nothing here enforces that it never will.
    const roleWord = c.roles[role] ?? role;
    const signInUrl = `${appBaseUrl()}/sign-in`;

    // A workspace names itself, typed by whoever created it, and this message
    // lands in a personal inbox reading someone else's business name — the
    // same field `provider-invite.template.ts` already escapes, for the same
    // reason ("A business called `<b>` must not become markup somebody else
    // wrote"). Escaped once, here, before it reaches the copy functions below
    // — those are not escaped again, so an already-escaped "&lt;" cannot turn
    // into "&amp;lt;". `safeRoleWord` gets the same treatment, for the same
    // reason: it is the other payload-derived value this template
    // interpolates, and escaping one and not the other is exactly the gap
    // `firstName` in `welcome.template.ts` left open.
    const safeName = escapeHtml(rawName);
    const safeRoleWord = escapeHtml(roleWord);

    return {
      // Plain text, not markup, like every other template's subject here —
      // never escaped.
      subject: c.subject(rawName),
      html: emailLayout({
        heading: c.heading(safeName),
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${c.body(safeName, safeRoleWord)}</p>${buttonHtml(signInUrl, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading(rawName)}\n\n${c.body(rawName, roleWord)}\n\n${signInUrl}`,
    };
  },
};
