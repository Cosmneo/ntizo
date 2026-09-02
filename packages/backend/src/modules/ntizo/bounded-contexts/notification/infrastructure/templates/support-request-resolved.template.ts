import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { escapeHtml, pickCopy, type TemplateModule } from "./copy";
import { requesterThreadUrl, subjectOf } from "./support-links";

interface Copy {
  subject: (s: string) => string;
  heading: string;
  body: (s: string) => string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: (s) => `Your request was resolved: ${s}`,
  heading: "Request resolved",
  body: (s) => `Ntizo Support marked your request "${s}" as resolved. If it is not, reply on it and it reopens.`,
  cta: "See the request",
  disclaimer: "You are receiving this because you have an open support request on Ntizo.",
};

const PT: Copy = {
  subject: (s) => `O seu pedido foi resolvido: ${s}`,
  heading: "Pedido resolvido",
  body: (s) => `O Suporte Ntizo marcou o seu pedido «${s}» como resolvido. Se não estiver, responda no pedido e ele reabre.`,
  cta: "Ver o pedido",
  disclaimer: "Recebe esta mensagem porque tem um pedido de suporte aberto na Ntizo.",
};

const ES: Copy = {
  subject: (s) => `Tu solicitud fue resuelta: ${s}`,
  heading: "Solicitud resuelta",
  body: (s) => `El Soporte de Ntizo marcó tu solicitud «${s}» como resuelta. Si no lo está, responde en ella y se reabrirá.`,
  cta: "Ver la solicitud",
  disclaimer: "Recibes este mensaje porque tienes una solicitud de soporte abierta en Ntizo.",
};

const FR: Copy = {
  subject: (s) => `Votre demande a été résolue : ${s}`,
  heading: "Demande résolue",
  body: (s) => `Le support Ntizo a marqué votre demande « ${s} » comme résolue. Si ce n'est pas le cas, répondez-y et elle rouvrira.`,
  cta: "Voir la demande",
  disclaimer: "Vous recevez ce message car vous avez une demande d'assistance ouverte sur Ntizo.",
};

const IT: Copy = {
  subject: (s) => `La tua richiesta è stata risolta: ${s}`,
  heading: "Richiesta risolta",
  body: (s) => `Il supporto Ntizo ha contrassegnato la tua richiesta «${s}» come risolta. Se non lo è, rispondi e si riaprirà.`,
  cta: "Vedi la richiesta",
  disclaimer: "Ricevi questo messaggio perché hai una richiesta di assistenza aperta su Ntizo.",
};

const DE: Copy = {
  subject: (s) => `Ihre Anfrage wurde gelöst: ${s}`,
  heading: "Anfrage gelöst",
  body: (s) => `Der Ntizo-Support hat Ihre Anfrage „${s}“ als gelöst markiert. Falls nicht, antworten Sie darauf und sie wird wieder geöffnet.`,
  cta: "Anfrage ansehen",
  disclaimer: "Sie erhalten diese Nachricht, weil Sie eine offene Supportanfrage bei Ntizo haben.",
};

const NL: Copy = {
  subject: (s) => `Je verzoek is opgelost: ${s}`,
  heading: "Verzoek opgelost",
  body: (s) => `Ntizo Support heeft je verzoek "${s}" als opgelost gemarkeerd. Is dat niet zo, reageer er dan op en het heropent.`,
  cta: "Bekijk het verzoek",
  disclaimer: "Je ontvangt dit bericht omdat je een open supportverzoek hebt bij Ntizo.",
};

export const BY_LOCALE: Record<string, Copy> = {
  "en-US": EN, "pt-MZ": PT, "pt-PT": PT, "es-ES": ES, "fr-FR": FR, "it-IT": IT, "de-DE": DE, "nl-NL": NL,
};

/** Raised by `ResolveSupportRequestCommand` when an admin marks a support request resolved. */
export const supportRequestResolvedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const subject = subjectOf(payload);
    const url = requesterThreadUrl(payload);
    return {
      subject: c.subject(subject),
      html: emailLayout({
        heading: c.heading,
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body(subject))}</p>${buttonHtml(url, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading}\n\n${c.body(subject)}\n\n${url}`,
    };
  },
};
