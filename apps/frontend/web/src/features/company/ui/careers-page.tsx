import { useTranslation } from "react-i18next";
import { SectionHead } from "@/features/landing/ui/section-head";
import { CONTACT } from "@/shared/lib/contact";
import { CompanyPage } from "./company-page";
import { CARD_SURFACE_CLASS } from "@/shared/components/card-surface";

interface Principle {
  title: string;
  body: string;
}

/**
 * No open roles, said plainly, and a spontaneous application by email. The
 * three "how we work" sentences are the only copy on the five pages not
 * derived from the code; the owner approved them.
 *
 * Drawn on the home page's rules since 2026-09-07. Two of this page's eyebrows
 * were the only thing naming their block, so they became the headings rather
 * than disappearing with the treatment.
 */
export function CareersPage() {
  const { t } = useTranslation("company");
  const how = t("careers.how", { returnObjects: true }) as Principle[] | string;
  const mailto = `mailto:${CONTACT.general}?subject=${encodeURIComponent(t("careers.mailSubject"))}`;

  return (
    <CompanyPage page="careers" title={t("careers.heading")} lede={t("careers.lede")}>
      <section className="page-shell pb-14">
        <div className="grid gap-10 md:grid-cols-2 md:gap-14">
          <div>
            {/* Was an eyebrow with two paragraphs under it and no heading at
                all. It is the heading now. */}
            <SectionHead title={t("careers.buildingEyebrow")} />
            <div className={CARD_SURFACE_CLASS}>
              <p className="text-[15.5px] leading-relaxed text-[var(--color-foreground)]">
                {t("careers.building1")}
              </p>
              <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--color-foreground)]">
                {t("careers.building2")}
              </p>
            </div>
          </div>
          <div>
            <SectionHead title={t("careers.howEyebrow")} />
            <ul className="grid list-none gap-4 p-0">
              {Array.isArray(how) &&
                how.map((p) => (
                  <li key={p.title} className={CARD_SURFACE_CLASS}>
                    <h3 className="font-display text-[16.5px] font-bold text-[var(--color-headline)]">
                      {p.title}
                    </h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--color-foreground)]">
                      {p.body}
                    </p>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>

      {/* The ask, on the site's own card and roomier than the rest — it is
          the only thing in its section. The blue pill on its right is gone:
          the site spends blue on the header's search and sign-in, so the
          button here is navy like every other affirmative control. */}
      <section className="page-shell pb-14">
        <div className={`${CARD_SURFACE_CLASS} md:p-8`}>
          <h2 className="font-display text-[clamp(1.35rem,2.4vw,1.75rem)] font-extrabold tracking-[-0.02em] text-[var(--color-headline)]">
            {t("careers.openingsTitle")}
          </h2>
          <p className="mt-3 max-w-[56ch] text-[15.5px] leading-relaxed text-[var(--color-foreground)]">
            {t("careers.openingsBody")}
          </p>
          <a
            href={mailto}
            className="font-rounded mt-6 inline-flex items-center rounded-full bg-[var(--color-navy-surface)] px-7 py-3.5 text-[15px] font-bold text-[var(--color-navy-on)] no-underline"
          >
            {t("careers.openingsCta")}
          </a>
          <p className="mt-3 text-[13.5px] text-[var(--color-muted-foreground)]">
            {t("careers.openingsHint", { email: CONTACT.general })}
          </p>
        </div>
      </section>
    </CompanyPage>
  );
}
