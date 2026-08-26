import { buttonHtml, emailLayout } from "./layout";
import { pickCopy } from "./copy";

interface Copy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  orPaste: string;
  disclaimer: string;
  text: string;
}

/**
 * The one-hour expiry is stated in every language rather than left implicit.
 *
 * Somebody who cannot read the sentence still has to know the link dies, or
 * they open it tomorrow and read a failure they have no way to explain.
 */
const COPY: Record<string, Copy> = {
  "en-US": { subject: "Reset your password", heading: "Reset your password", body: "We received a request to reset your Ntizo password. Click the button below to choose a new one. This link expires in 1 hour.", cta: "Reset password", orPaste: "Or copy and paste this link into your browser:", disclaimer: "If you didn't request a password reset, you can safely ignore this email.", text: "Reset your password" },
  "pt-MZ": { subject: "Redefinir a sua palavra-passe", heading: "Redefinir a sua palavra-passe", body: "Recebemos um pedido para redefinir a sua palavra-passe da Ntizo. Clique no botão abaixo para escolher uma nova. Esta ligação expira dentro de 1 hora.", cta: "Redefinir palavra-passe", orPaste: "Ou copie e cole esta ligação no seu navegador:", disclaimer: "Se não pediu para redefinir a palavra-passe, pode ignorar este e-mail com segurança.", text: "Redefinir a sua palavra-passe" },
  "pt-PT": { subject: "Redefinir a sua palavra-passe", heading: "Redefinir a sua palavra-passe", body: "Recebemos um pedido para redefinir a sua palavra-passe da Ntizo. Clique no botão abaixo para escolher uma nova. Esta ligação expira dentro de 1 hora.", cta: "Redefinir palavra-passe", orPaste: "Ou copie e cole esta ligação no seu navegador:", disclaimer: "Se não pediu para redefinir a palavra-passe, pode ignorar este e-mail com segurança.", text: "Redefinir a sua palavra-passe" },
  "es-ES": { subject: "Restablece tu contraseña", heading: "Restablece tu contraseña", body: "Recibimos una solicitud para restablecer tu contraseña de Ntizo. Haz clic en el botón de abajo para elegir una nueva. Este enlace caduca en 1 hora.", cta: "Restablecer contraseña", orPaste: "O copia y pega este enlace en tu navegador:", disclaimer: "Si no solicitaste restablecer la contraseña, puedes ignorar este correo.", text: "Restablece tu contraseña" },
  "fr-FR": { subject: "Réinitialisez votre mot de passe", heading: "Réinitialisez votre mot de passe", body: "Nous avons reçu une demande de réinitialisation de votre mot de passe Ntizo. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien expire dans 1 heure.", cta: "Réinitialiser le mot de passe", orPaste: "Ou copiez ce lien dans votre navigateur :", disclaimer: "Si vous n’avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail.", text: "Réinitialisez votre mot de passe" },
  "it-IT": { subject: "Reimposta la tua password", heading: "Reimposta la tua password", body: "Abbiamo ricevuto una richiesta di reimpostazione della tua password Ntizo. Clicca sul pulsante qui sotto per sceglierne una nuova. Questo link scade tra 1 ora.", cta: "Reimposta password", orPaste: "Oppure copia e incolla questo link nel browser:", disclaimer: "Se non hai richiesto la reimpostazione, puoi ignorare questa e-mail.", text: "Reimposta la tua password" },
  "de-DE": { subject: "Passwort zurücksetzen", heading: "Passwort zurücksetzen", body: "Wir haben eine Anfrage erhalten, Ihr Ntizo-Passwort zurückzusetzen. Klicken Sie auf die Schaltfläche unten, um ein neues zu wählen. Dieser Link läuft in 1 Stunde ab.", cta: "Passwort zurücksetzen", orPaste: "Oder kopieren Sie diesen Link in Ihren Browser:", disclaimer: "Wenn Sie kein Zurücksetzen angefordert haben, können Sie diese E-Mail ignorieren.", text: "Passwort zurücksetzen" },
  "nl-NL": { subject: "Stel je wachtwoord opnieuw in", heading: "Stel je wachtwoord opnieuw in", body: "We hebben een verzoek ontvangen om je Ntizo-wachtwoord opnieuw in te stellen. Klik op de knop hieronder om een nieuw wachtwoord te kiezen. Deze link verloopt over 1 uur.", cta: "Wachtwoord opnieuw instellen", orPaste: "Of kopieer en plak deze link in je browser:", disclaimer: "Als je hier niet om hebt gevraagd, kun je deze e-mail negeren.", text: "Stel je wachtwoord opnieuw in" },
};

export function resetPasswordTemplate(
  url: string,
  locale = "en-US",
): { subject: string; html: string; text: string } {
  const c = pickCopy(COPY, locale);
  return {
    subject: c.subject,
    html: emailLayout({
      heading: c.heading,
      bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">
        ${c.body}
      </p>${buttonHtml(url, c.cta)}
      <p style="font-size:12px;color:#888;">${c.orPaste}<br/><a href="${url}">${url}</a></p>`,
      disclaimer: c.disclaimer,
    }),
    text: `${c.text}: ${url}`,
  };
}
