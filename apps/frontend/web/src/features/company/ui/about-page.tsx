import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SectionHead } from "@/features/landing/ui/section-head";
import { CompanyPage } from "./company-page";
import { CARD_SURFACE_CLASS } from "@/shared/components/card-surface";

/**
 * Who Ntizo is, told through what the product does — mission, the three
 * steps, four principles, two audiences. No founding year, no city, no names:
 * the owner chose (2026-09-02) not to publish them.
 *
 * Drawn on the home page's rules since 2026-09-07. The blue half-headline,
 * the blue `01`/`02`/`03`, the eyebrow over every block and the rounded
 * cells sharing one outer border are gone; what replaced them is what the
 * home uses — `SectionHead`, `CARD_SURFACE_CLASS` per block, and navy where
 * something is affirmative.
 */
export function AboutPage() {
  const { t } = useTranslation("company");

  return (
    <CompanyPage
      page="about"
      title={`${t("about.heading")} ${t("about.headingAccent")}.`}
      lede={t("about.lede")}
    >
      {/* The mission statement is the heading. It used to sit under an
          eyebrow reading "Our mission", which said less than the sentence
          below it did. */}
      <section className="page-shell pb-14">
        <div className={`grid gap-8 md:grid-cols-[1.1fr_1fr] md:gap-14 ${CARD_SURFACE_CLASS} md:p-8`}>
          <h2 className="font-display max-w-[24ch] text-[clamp(1.5rem,2.8vw,2rem)] leading-[1.12] font-extrabold tracking-[-0.02em] text-[var(--color-headline)]">
            {t("about.missionTitle")}
          </h2>
          <div className="text-[16px] leading-relaxed text-[var(--color-foreground)]">
            <p>{t("about.mission1")}</p>
            <p className="mt-4">{t("about.mission2")}</p>
          </div>
        </div>
      </section>

      {/* These three keep their numbers: search, book, pay is an order, and
          the whole point of the section is that paying comes last. Small navy
          markers, the same shape the provider pitch's steps use — not blue
          `01`s, which spent the site's one accent three times in a row. */}
      <section className="page-shell pb-14">
        <SectionHead title={t("about.howTitle")} />
        <ol className="grid list-none gap-6 p-0 md:grid-cols-3">
          {(["search", "book", "pay"] as const).map((key, i) => (
            <li key={key} className={CARD_SURFACE_CLASS}>
              <span
                aria-hidden="true"
                className="mb-3.5 grid h-[26px] w-[26px] place-items-center rounded-full bg-[var(--color-navy-surface)] text-[12.5px] font-bold text-[var(--color-navy-on)] tabular-nums"
              >
                {i + 1}
              </span>
              <h3 className="font-display text-[16.5px] font-bold text-[var(--color-headline)]">
                {t(`about.steps.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--color-foreground)]">
                {t(`about.steps.${key}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Four beliefs, and no order between them, so no numbers. Four
          separate cards rather than four cells inside one bordered box: they
          are four things to weigh one at a time, not a table. */}
      <section className="page-shell pb-14">
        <SectionHead title={t("about.principlesTitle")} />
        <div className="grid gap-6 md:grid-cols-2">
          {(["price", "verification", "payAfter", "local"] as const).map((key) => (
            <article key={key} className={CARD_SURFACE_CLASS}>
              <h3 className="font-display text-[17px] font-bold text-[var(--color-headline)]">
                {t(`about.principles.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--color-foreground)]">
                {t(`about.principles.${key}.body`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="page-shell pb-14">
        <div className="grid gap-6 md:grid-cols-2">
          <Audience
            title={t("about.customersTitle")}
            body={t("about.customersBody")}
            cta={t("about.customersCta")}
            to="/services"
          />
          <Audience
            title={t("about.providersTitle")}
            body={t("about.providersBody")}
            cta={t("about.providersCta")}
            to="/become-provider"
          />
        </div>
      </section>
    </CompanyPage>
  );
}

/**
 * One of the two doors off this page.
 *
 * Both are bare text links, and neither is a button. They used to be a filled
 * blue pill and an outlined one, which ranked them: the customer's way out was
 * the loud one and the provider's the quiet one, on a page whose whole last
 * section exists to offer both. Ranking them was never the intent, and the
 * blue was the page's second accent besides.
 */
function Audience({
  title,
  body,
  cta,
  to,
}: {
  title: string;
  body: string;
  cta: string;
  to: string;
}) {
  return (
    <article className={CARD_SURFACE_CLASS}>
      <h3 className="font-display text-[20px] font-bold tracking-[-0.01em] text-[var(--color-headline)]">
        {title}
      </h3>
      <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--color-foreground)]">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-block text-[15px] font-semibold text-[var(--color-headline)] underline decoration-[var(--color-border-strong)] underline-offset-4"
      >
        {cta}
      </Link>
    </article>
  );
}
