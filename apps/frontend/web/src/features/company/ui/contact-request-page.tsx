import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ContactRequestKind } from "@ntizo/shared";
import { CONTACT } from "@/shared/lib/contact";
import { CompanyPage } from "./company-page";
import { ContactForm } from "./contact-form";
import { CARD_SURFACE_CLASS } from "@/shared/components/card-surface";

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
 * On the home page's rules since 2026-09-07: white, the heading in navy,
 * hairlines under the three notes instead of bordered cards, and the links
 * inside them as text rather than blue.
 *
 * Single centred column, decided 2026-09-02 against a side rail: the form is
 * what the page is for, and the alternatives sit under it rather than beside
 * it. Each kind's copy lives under its own key in the `company` namespace,
 * and the kind doubles as the frame's page id.
 */
export function ContactRequestPage({ kind }: { kind: ContactRequestKind }) {
  const { t } = useTranslation("company");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <CompanyPage page={kind} title={t(`${kind}.heading`)} lede={t(`${kind}.lede`)} centred>
      <section className="page-shell py-12 md:py-16">
        <div className="mx-auto max-w-[640px]">
          <ContactForm kind={kind} messagePlaceholder={t(`${kind}.messagePlaceholder`)} />
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {CARDS[kind].map((card) => (
            <article
              key={card.key}
              className={CARD_SURFACE_CLASS}
            >
              <h2 className="font-display m-0 text-[15.5px] font-bold text-[var(--color-headline)]">
                {t(`${kind}.cards.${card.key}.title`)}
              </h2>
              <p className="mt-1.5 mb-0 text-[14.5px] leading-relaxed text-[var(--color-foreground)]">
                {card.kind === "email" && (
                  <>
                    <a href={`mailto:${CONTACT.general}`} className="font-semibold text-[var(--color-headline)] underline decoration-[var(--color-border-strong)] underline-offset-4">
                      {CONTACT.general}
                    </a>
                    <br />
                  </>
                )}
                {t(`${kind}.cards.${card.key}.body`)}
                {card.kind === "social" && (
                  <>
                    <br />
                    <a
                      href={CONTACT.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[var(--color-headline)] underline decoration-[var(--color-border-strong)] underline-offset-4"
                    >
                      Instagram
                    </a>
                    {" · "}
                    <a
                      href={CONTACT.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[var(--color-headline)] underline decoration-[var(--color-border-strong)] underline-offset-4"
                    >
                      LinkedIn
                    </a>
                  </>
                )}
              </p>
              {card.to && (
                <Link
                  to={card.to}
                  search={card.to === "/feedback" ? { from: pathname } : undefined}
                  className="mt-3 inline-flex items-center text-[14px] font-semibold text-[var(--color-headline)] underline decoration-[var(--color-border-strong)] underline-offset-4"
                >
                  {t(`${kind}.cards.${card.key}.cta`)}
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>
    </CompanyPage>
  );
}
