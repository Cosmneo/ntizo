import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CompanyPage } from "@/features/company/ui/company-page";
import { FAQ_CATEGORIES } from "@/features/help-center/domain/faq";
import { FaqAccordion } from "@/features/help-center/ui/faq-accordion";
import { useFaqEntries } from "@/features/help-center/ui/help-faq";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";
import { CONTACT } from "@/shared/lib/contact";
import { SectionHead } from "@/features/landing/ui/section-head";
import { CARD_SURFACE_CLASS } from "@/shared/components/card-surface";

/**
 * The FAQ, on a page anyone can link to and a crawler can read.
 *
 * The same twenty answers the panel shows, from the same `help` namespace —
 * one FAQ, two surfaces. It wears `CompanyPage`'s frame so it sits beside
 * `/about` and `/contact` rather than inventing a third page shape, and its
 * categories carry ids so `/help#payments` lands where it says.
 *
 * The panel is the primary way out at the end, not a mailto: somebody
 * reading the FAQ is already signed in more often than not, and a request
 * that arrives as a thread beats one that arrives as an email nobody can
 * reply to inside the product. The address stays as the second line, for
 * whoever cannot sign in.
 */
export function HelpPage() {
  const { t } = useTranslation("help");
  const entries = useFaqEntries();
  const help = useHelpCenter();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <CompanyPage page="help" title={t("page.title")} lede={t("page.lede")}>
      {/* The page's own gutter. `CompanyPage` puts its opening inside
          `page-shell` and hands `children` through untouched, because every
          other page it frames brings its own — this one never did, so the
          categories and every accordion row ran the full width of the window
          while the heading above them sat in the column. */}
      <div className="page-shell grid gap-10 pb-14">
        {FAQ_CATEGORIES.map((category) => (
          <section key={category.id} id={category.id} className="scroll-mt-24">
            <SectionHead title={t(`faq.${category.id}.title`)} />
            <FaqAccordion
              entries={entries.filter((entry) => entry.categoryId === category.id)}
              openId={openId}
              onToggle={(id) => setOpenId((current) => (current === id ? null : id))}
            />
          </section>
        ))}

        <section className={`grid gap-2 ${CARD_SURFACE_CLASS}`}>
          <h2 className="font-display text-[20px] font-bold text-[var(--color-headline)]">
            {t("page.contactTitle")}
          </h2>
          <p className="type-body text-[var(--color-muted-foreground)]">{t("page.contactBody")}</p>
          <button
            type="button"
            onClick={() => help.composeNew()}
            className="type-body-medium justify-self-start rounded-full bg-[var(--color-navy-surface)] px-5 py-2.5 text-[var(--color-navy-on)]"
          >
            {t("page.contactAction")}
          </button>
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("page.contactEmailPrefix")}{" "}
            <a href={`mailto:${CONTACT.support}`} className="text-[var(--color-headline)] underline decoration-[var(--color-border-strong)] underline-offset-4">
              {CONTACT.support}
            </a>
            .
          </p>
        </section>
      </div>
    </CompanyPage>
  );
}
