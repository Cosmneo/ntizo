import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ContactRequestKind } from "@ntizo/shared";
import { ACCENT } from "@/features/landing/ui/palette";
import { CONTACT } from "@/shared/lib/contact";
import { CompanyPage } from "./company-page";
import { ContactForm } from "./contact-form";

/** Which three cards sit under each form, and where the linking one goes. */
const CARDS: Record<ContactRequestKind, ReadonlyArray<{ key: string; kind: "email" | "social" | "text" | "link"; to?: string }>> = {
  contact: [
    { key: "email", kind: "email" },
    { key: "social", kind: "social" },
    { key: "feedback", kind: "link", to: "/feedback" },
  ],
  feedback: [
    { key: "read", kind: "text" },
    { key: "contact", kind: "link", to: "/contact" },
    { key: "social", kind: "social" },
  ],
};

/**
 * Contact and Feedback: a centred band, the form, three cards.
 *
 * Single centred column, decided 2026-09-02 against a side rail: the form is
 * what the page is for, and the alternatives sit under it rather than beside
 * it. Each kind's copy lives under its own key in the `company` namespace,
 * and the kind doubles as the frame's page id.
 */
export function ContactRequestPage({ kind }: { kind: ContactRequestKind }) {
  const { t } = useTranslation("company");

  return (
    <CompanyPage page={kind} eyebrow={t(`${kind}.eyebrow`)} title={t(`${kind}.heading`)} lede={t(`${kind}.lede`)} centred>
      <section className="page-shell py-12 md:py-16">
        <div className="mx-auto max-w-[640px]">
          <ContactForm kind={kind} messagePlaceholder={t(`${kind}.messagePlaceholder`)} />
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {CARDS[kind].map((card) => (
            <article
              key={card.key}
              className="rounded-[16px] border p-5"
              style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
            >
              <h2 className="font-rounded m-0 text-[15px] font-extrabold">{t(`${kind}.cards.${card.key}.title`)}</h2>
              <p className="mt-1.5 mb-0 text-sm leading-relaxed text-[color:var(--l-muted)]">
                {card.kind === "email" && (
                  <>
                    <a href={`mailto:${CONTACT.general}`} className="font-semibold no-underline" style={{ color: "var(--l-navy)" }}>
                      {CONTACT.general}
                    </a>
                    <br />
                  </>
                )}
                {t(`${kind}.cards.${card.key}.body`)}
                {card.kind === "social" && (
                  <>
                    <br />
                    <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: ACCENT }}>Instagram</a>
                    {" · "}
                    <a href={CONTACT.linkedin} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: ACCENT }}>LinkedIn</a>
                  </>
                )}
              </p>
              {card.to && (
                <Link to={card.to} className="mt-3 inline-flex items-center text-sm font-semibold no-underline" style={{ color: ACCENT }}>
                  {t(`${kind}.cards.${card.key}.cta`)} →
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>
    </CompanyPage>
  );
}
