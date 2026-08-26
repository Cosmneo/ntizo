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
 * Eight locales, because this is the FIRST mail anybody receives.
 *
 * It shipped English-only while the app itself spoke eight languages, so a
 * Mozambican who registered in Portuguese was asked, in English, to confirm
 * the address — the one step between signing up and having an account.
 */
const COPY: Record<string, Copy> = {
  "en-US": { subject: "Verify your email", heading: "Verify your email", body: "Click the button below to verify your email address and activate your Ntizo account.", cta: "Verify email", orPaste: "Or copy and paste this link into your browser:", disclaimer: "If you didn't create an account, you can safely ignore this email.", text: "Verify your email" },
  "pt-MZ": { subject: "Confirme o seu e-mail", heading: "Confirme o seu e-mail", body: "Clique no botão abaixo para confirmar o seu endereço de e-mail e activar a sua conta Ntizo.", cta: "Confirmar e-mail", orPaste: "Ou copie e cole esta ligação no seu navegador:", disclaimer: "Se não criou nenhuma conta, pode ignorar este e-mail com segurança.", text: "Confirme o seu e-mail" },
  "pt-PT": { subject: "Confirme o seu e-mail", heading: "Confirme o seu e-mail", body: "Clique no botão abaixo para confirmar o seu endereço de e-mail e activar a sua conta Ntizo.", cta: "Confirmar e-mail", orPaste: "Ou copie e cole esta ligação no seu navegador:", disclaimer: "Se não criou nenhuma conta, pode ignorar este e-mail com segurança.", text: "Confirme o seu e-mail" },
  "es-ES": { subject: "Verifica tu correo", heading: "Verifica tu correo", body: "Haz clic en el botón de abajo para verificar tu dirección de correo y activar tu cuenta de Ntizo.", cta: "Verificar correo", orPaste: "O copia y pega este enlace en tu navegador:", disclaimer: "Si no creaste ninguna cuenta, puedes ignorar este correo.", text: "Verifica tu correo" },
  "fr-FR": { subject: "Vérifiez votre e-mail", heading: "Vérifiez votre e-mail", body: "Cliquez sur le bouton ci-dessous pour vérifier votre adresse e-mail et activer votre compte Ntizo.", cta: "Vérifier l’e-mail", orPaste: "Ou copiez ce lien dans votre navigateur :", disclaimer: "Si vous n’avez pas créé de compte, vous pouvez ignorer cet e-mail.", text: "Vérifiez votre e-mail" },
  "it-IT": { subject: "Verifica la tua e-mail", heading: "Verifica la tua e-mail", body: "Clicca sul pulsante qui sotto per verificare il tuo indirizzo e-mail e attivare il tuo account Ntizo.", cta: "Verifica e-mail", orPaste: "Oppure copia e incolla questo link nel browser:", disclaimer: "Se non hai creato un account, puoi ignorare questa e-mail.", text: "Verifica la tua e-mail" },
  "de-DE": { subject: "Bestätigen Sie Ihre E-Mail", heading: "Bestätigen Sie Ihre E-Mail", body: "Klicken Sie auf die Schaltfläche unten, um Ihre E-Mail-Adresse zu bestätigen und Ihr Ntizo-Konto zu aktivieren.", cta: "E-Mail bestätigen", orPaste: "Oder kopieren Sie diesen Link in Ihren Browser:", disclaimer: "Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.", text: "Bestätigen Sie Ihre E-Mail" },
  "nl-NL": { subject: "Bevestig je e-mailadres", heading: "Bevestig je e-mailadres", body: "Klik op de knop hieronder om je e-mailadres te bevestigen en je Ntizo-account te activeren.", cta: "E-mailadres bevestigen", orPaste: "Of kopieer en plak deze link in je browser:", disclaimer: "Als je geen account hebt aangemaakt, kun je deze e-mail negeren.", text: "Bevestig je e-mailadres" },
};

export function verifyEmailTemplate(
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
