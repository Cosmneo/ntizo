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
  subject: "Action needed: update your verification documents",
  heading: "Your documents need attention",
  body: "We couldn't verify your account with the documents on file. Please review and resubmit them so we can list your business.",
  cta: "Update your documents",
  disclaimer: "You are receiving this because your verification status changed.",
};

const PT: Copy = {
  subject: "Ação necessária: atualize os seus documentos de verificação",
  heading: "Os seus documentos precisam de atenção",
  body: "Não foi possível verificar a sua conta com os documentos enviados. Reveja-os e submeta-os novamente para que possamos listar o seu negócio.",
  cta: "Atualizar os documentos",
  disclaimer: "Recebeu esta mensagem porque o estado da sua verificação mudou.",
};

const ES: Copy = {
  subject: "Acción necesaria: actualiza tus documentos de verificación",
  heading: "Tus documentos necesitan atención",
  body: "No pudimos verificar tu cuenta con los documentos enviados. Revísalos y vuelve a enviarlos para que podamos publicar tu negocio.",
  cta: "Actualizar documentos",
  disclaimer: "Recibes este mensaje porque cambió el estado de tu verificación.",
};

const FR: Copy = {
  subject: "Action requise : mettez à jour vos documents de vérification",
  heading: "Vos documents nécessitent une action",
  body: "Nous n'avons pas pu vérifier votre compte avec les documents envoyés. Merci de les revoir et de les soumettre à nouveau pour que nous puissions publier votre activité.",
  cta: "Mettre à jour les documents",
  disclaimer: "Vous recevez ce message car l'état de votre vérification a changé.",
};

const IT: Copy = {
  subject: "Azione richiesta: aggiorna i tuoi documenti di verifica",
  heading: "I tuoi documenti richiedono attenzione",
  body: "Non siamo riusciti a verificare il tuo account con i documenti inviati. Rivedili e inviali di nuovo per poter pubblicare la tua attività.",
  cta: "Aggiorna i documenti",
  disclaimer: "Ricevi questo messaggio perché lo stato della tua verifica è cambiato.",
};

const DE: Copy = {
  subject: "Aktion erforderlich: aktualisieren Sie Ihre Verifizierungsunterlagen",
  heading: "Ihre Unterlagen benötigen Aufmerksamkeit",
  body: "Wir konnten Ihr Konto mit den eingereichten Unterlagen nicht verifizieren. Bitte prüfen und reichen Sie sie erneut ein, damit wir Ihr Unternehmen listen können.",
  cta: "Unterlagen aktualisieren",
  disclaimer: "Sie erhalten diese Nachricht, weil sich Ihr Verifizierungsstatus geändert hat.",
};

const NL: Copy = {
  subject: "Actie vereist: werk je verificatiedocumenten bij",
  heading: "Je documenten hebben aandacht nodig",
  body: "We konden je account niet verifiëren met de ingediende documenten. Bekijk ze en dien ze opnieuw in, zodat we je bedrijf kunnen vermelden.",
  cta: "Documenten bijwerken",
  disclaimer: "Je ontvangt dit bericht omdat je verificatiestatus is gewijzigd.",
};

const BY_LOCALE: Record<string, Copy> = {
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
 * A provider's documents were rejected and need resubmission.
 *
 * Receives `{ from, to }` and uses neither, for the same reason
 * `provider-verified.template.ts` does: this template only runs when
 * `provider.status.decided` moves a provider `to: "rejected"`, so the outcome
 * is already fixed by which template ran. What matters here is saying what to
 * do next, not narrating the status change itself.
 */
export const providerDocumentsRequiredTemplate: TemplateModule = {
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
