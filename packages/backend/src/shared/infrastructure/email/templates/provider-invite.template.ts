/**
 * The invitation email.
 *
 * Built as tables with inline styles, and no image anywhere. That is not
 * nostalgia — Outlook still renders with Word's engine, which ignores flexbox
 * and most of the box model, and every major client blocks remote images by
 * default. A wordmark set in type survives all of them; an `<img>` logo shows
 * as an empty box to a large share of recipients, which is a worse first
 * impression than no logo.
 *
 * The link is the point. The version this replaces printed a 48-character hex
 * token into a paragraph and nothing else — the recipient had somewhere to
 * look and nowhere to click, and no way to know what to do with a hex string.
 */

const NAVY = "#13171b";
const ACCENT = "#006ffd";
const MUTED = "#71727a";
const BORDER = "#e5e5e5";
const GROUND = "#f2f8fe";

/**
 * The copy, in every language the app speaks.
 *
 * Here rather than in the frontend's i18n bundles because the server sends
 * this and never loads those. Duplicating eight short strings is the cost of
 * not shipping an i18n runtime into a Worker to render one email.
 *
 * The language is the *inviter's*, which is the only signal available: the
 * recipient has no account yet, so nothing is known about them but an address.
 * A colleague inviting a colleague almost always shares a language, and the
 * alternative is English for everyone.
 */
interface Copy {
  subject: (inviter: string, provider: string) => string;
  preheader: (inviter: string, provider: string, role: string, days: number) => string;
  heading: (provider: string) => string;
  body: (inviter: string, role: string, blurb: string) => string;
  cta: string;
  expiry: (days: number) => string;
  fallback: string;
  ignore: string;
  roles: Record<string, string>;
  blurbs: Record<string, string>;
}

const EN: Copy = {
  subject: (i, p) => `${i} invited you to ${p} on Ntizo`,
  preheader: (i, p, r, d) =>
    `${i} invited you to join ${p} as ${r}. The link is good for ${d} days.`,
  heading: (p) => `You’ve been invited to ${p}`,
  body: (i, r, b) =>
    `${i} added you to their workspace on Ntizo as <strong>${r}</strong>, so you can ${b}.`,
  cta: "Accept the invitation",
  expiry: (d) =>
    `This link works for ${d} days. If the button doesn’t open, paste this into your browser:`,
  fallback: "Accept the invitation:",
  ignore:
    "Not expecting this? You can ignore this email — nothing happens until you accept, and the invitation expires on its own.",
  roles: { owner: "owner", admin: "administrator", staff: "team member" },
  blurbs: {
    admin: "manage the team, services and bookings",
    staff: "take bookings and manage your own schedule",
  },
};

const PT: Copy = {
  subject: (i, p) => `${i} convidou-o para ${p} na Ntizo`,
  preheader: (i, p, r, d) =>
    `${i} convidou-o para se juntar a ${p} como ${r}. O link é válido por ${d} dias.`,
  heading: (p) => `Foi convidado para ${p}`,
  body: (i, r, b) =>
    `${i} adicionou-o ao workspace na Ntizo como <strong>${r}</strong>, para poder ${b}.`,
  cta: "Aceitar o convite",
  expiry: (d) =>
    `Este link é válido por ${d} dias. Se o botão não abrir, cole isto no seu navegador:`,
  fallback: "Aceitar o convite:",
  ignore:
    "Não estava à espera disto? Pode ignorar este email — nada acontece até aceitar, e o convite expira sozinho.",
  roles: { owner: "proprietário", admin: "administrador", staff: "colaborador" },
  blurbs: {
    admin: "gerir a equipa, os serviços e as reservas",
    staff: "receber reservas e gerir a sua própria agenda",
  },
};

const ES: Copy = {
  subject: (i, p) => `${i} te invitó a ${p} en Ntizo`,
  preheader: (i, p, r, d) =>
    `${i} te invitó a unirte a ${p} como ${r}. El enlace vale ${d} días.`,
  heading: (p) => `Te han invitado a ${p}`,
  body: (i, r, b) =>
    `${i} te añadió a su espacio en Ntizo como <strong>${r}</strong>, para que puedas ${b}.`,
  cta: "Aceptar la invitación",
  expiry: (d) =>
    `Este enlace vale ${d} días. Si el botón no abre, pega esto en tu navegador:`,
  fallback: "Aceptar la invitación:",
  ignore:
    "¿No lo esperabas? Puedes ignorar este correo: nada ocurre hasta que aceptes, y la invitación caduca sola.",
  roles: { owner: "propietario", admin: "administrador", staff: "personal" },
  blurbs: {
    admin: "gestionar el equipo, los servicios y las reservas",
    staff: "recibir reservas y gestionar tu propia agenda",
  },
};

const FR: Copy = {
  subject: (i, p) => `${i} vous a invité à rejoindre ${p} sur Ntizo`,
  preheader: (i, p, r, d) =>
    `${i} vous a invité à rejoindre ${p} en tant que ${r}. Le lien est valable ${d} jours.`,
  heading: (p) => `Vous êtes invité à rejoindre ${p}`,
  body: (i, r, b) =>
    `${i} vous a ajouté à son espace sur Ntizo en tant que <strong>${r}</strong>, pour que vous puissiez ${b}.`,
  cta: "Accepter l’invitation",
  expiry: (d) =>
    `Ce lien est valable ${d} jours. Si le bouton ne s’ouvre pas, collez ceci dans votre navigateur :`,
  fallback: "Accepter l’invitation :",
  ignore:
    "Vous ne vous y attendiez pas ? Ignorez cet e-mail — rien ne se passe tant que vous n’acceptez pas, et l’invitation expire d’elle-même.",
  roles: { owner: "propriétaire", admin: "administrateur", staff: "équipier" },
  blurbs: {
    admin: "gérer l’équipe, les prestations et les réservations",
    staff: "recevoir des réservations et gérer votre propre agenda",
  },
};

const DE: Copy = {
  subject: (i, p) => `${i} hat Sie zu ${p} auf Ntizo eingeladen`,
  preheader: (i, p, r, d) =>
    `${i} hat Sie eingeladen, ${p} als ${r} beizutreten. Der Link gilt ${d} Tage.`,
  heading: (p) => `Sie wurden zu ${p} eingeladen`,
  body: (i, r, b) =>
    `${i} hat Sie als <strong>${r}</strong> zum Workspace auf Ntizo hinzugefügt, damit Sie ${b} können.`,
  cta: "Einladung annehmen",
  expiry: (d) =>
    `Dieser Link gilt ${d} Tage. Falls die Schaltfläche nicht funktioniert, fügen Sie dies in Ihren Browser ein:`,
  fallback: "Einladung annehmen:",
  ignore:
    "Nicht erwartet? Sie können diese E-Mail ignorieren — es passiert nichts, bis Sie annehmen, und die Einladung läuft von selbst ab.",
  roles: { owner: "Inhaber", admin: "Administrator", staff: "Mitarbeiter" },
  blurbs: {
    admin: "Team, Leistungen und Buchungen verwalten",
    staff: "Buchungen annehmen und den eigenen Kalender verwalten",
  },
};

const IT: Copy = {
  subject: (i, p) => `${i} ti ha invitato in ${p} su Ntizo`,
  preheader: (i, p, r, d) =>
    `${i} ti ha invitato a unirti a ${p} come ${r}. Il link vale ${d} giorni.`,
  heading: (p) => `Sei stato invitato in ${p}`,
  body: (i, r, b) =>
    `${i} ti ha aggiunto al suo spazio su Ntizo come <strong>${r}</strong>, così puoi ${b}.`,
  cta: "Accetta l’invito",
  expiry: (d) =>
    `Questo link vale ${d} giorni. Se il pulsante non si apre, incolla questo nel browser:`,
  fallback: "Accetta l’invito:",
  ignore:
    "Non te lo aspettavi? Puoi ignorare questa email — non succede nulla finché non accetti, e l’invito scade da solo.",
  roles: { owner: "proprietario", admin: "amministratore", staff: "collaboratore" },
  blurbs: {
    admin: "gestire il team, i servizi e le prenotazioni",
    staff: "ricevere prenotazioni e gestire la tua agenda",
  },
};

const NL: Copy = {
  subject: (i, p) => `${i} heeft je uitgenodigd voor ${p} op Ntizo`,
  preheader: (i, p, r, d) =>
    `${i} heeft je uitgenodigd voor ${p} als ${r}. De link is ${d} dagen geldig.`,
  heading: (p) => `Je bent uitgenodigd voor ${p}`,
  body: (i, r, b) =>
    `${i} heeft je als <strong>${r}</strong> aan de werkruimte op Ntizo toegevoegd, zodat je ${b}.`,
  cta: "Uitnodiging accepteren",
  expiry: (d) =>
    `Deze link is ${d} dagen geldig. Werkt de knop niet? Plak dit in je browser:`,
  fallback: "Uitnodiging accepteren:",
  ignore:
    "Niet verwacht? Negeer deze e-mail — er gebeurt niets tot je accepteert, en de uitnodiging verloopt vanzelf.",
  roles: { owner: "eigenaar", admin: "beheerder", staff: "medewerker" },
  blurbs: {
    admin: "het team, de diensten en de boekingen beheren",
    staff: "boekingen aannemen en je eigen agenda beheren",
  },
};

const COPY: Record<string, Copy> = {
  "en-US": EN,
  "pt-PT": PT,
  "pt-MZ": PT,
  "es-ES": ES,
  "fr-FR": FR,
  "de-DE": DE,
  "it-IT": IT,
  "nl-NL": NL,
};

/** English for anything unrecognised — a wrong language beats a blank email. */
function copyFor(locale: string | undefined): Copy {
  return COPY[locale ?? "en-US"] ?? EN;
}

/**
 * HTML-escapes a value before it is interpolated.
 *
 * Every field here is attacker-supplied in the sense that matters: a workspace
 * name is typed by whoever created it, and this string is rendered by a mail
 * client. Escaping is the difference between a business called `Salão <b>` and
 * a mail body someone else wrote.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ProviderInviteEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildProviderInviteEmail(params: {
  providerName: string;
  /** Who sent it. A name if we have one, otherwise their address. */
  inviterName: string;
  role: string;
  acceptUrl: string;
  /** Days until the link stops working. Stated, because it does. */
  expiresInDays: number;
  /** The inviter's language. See the note on `Copy`. */
  locale?: string;
}): ProviderInviteEmail {
  const c = copyFor(params.locale);
  const provider = esc(params.providerName);
  const inviter = esc(params.inviterName);
  const url = esc(params.acceptUrl);
  const roleWord = c.roles[params.role] ?? params.role;
  const roleLabel = esc(roleWord);
  const blurb = c.blurbs[params.role] ?? c.blurbs["staff"]!;
  const days = params.expiresInDays;

  const subject = c.subject(params.inviterName, params.providerName);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- Escaped: the subject is built from a workspace name somebody typed,
         and this is the one place it lands inside markup. The subject line
         itself is plain text and must not be escaped, so the two differ. -->
    <title>${esc(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${GROUND};">
    <!-- Shown in the inbox list under the subject, and nowhere else. Without
         it clients pull the first words of the body, which is the wordmark. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${esc(c.preheader(params.inviterName, params.providerName, roleWord, days))}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

            <tr>
              <td style="padding:0 4px 20px;">
                <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${ACCENT};">ntizo</span>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:36px 32px;">

                <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:24px;line-height:1.25;font-weight:700;color:${NAVY};">
                  ${c.heading(provider)}
                </h1>

                <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:${MUTED};">
                  ${c.body(inviter, `<strong style="color:${NAVY};">${roleLabel}</strong>`, blurb)}
                </p>

                <!-- Bulletproof button: a table cell with the background, an
                     anchor filling it. A styled <a> alone loses its background
                     in Outlook and arrives as blue underlined text. -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" bgcolor="${ACCENT}" style="border-radius:10px;">
                      <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                        ${c.cta}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.6;color:${MUTED};">
                  ${c.expiry(days)}
                </p>
                <!-- Spelled out because a share of recipients read plain text,
                     and because a button whose destination is invisible is the
                     shape every phishing email has. -->
                <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:${ACCENT};word-break:break-all;">
                  ${url}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
                ${c.ignore}
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    c.preheader(params.inviterName, params.providerName, roleWord, days),
    ``,
    c.fallback,
    params.acceptUrl,
    ``,
    c.ignore,
  ].join("\n");

  return { subject, html, text };
}
