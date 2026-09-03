import { useTranslation } from "react-i18next";
import { useState } from "react";
import { FAQ_CATEGORIES, type FaqEntry } from "@/features/help-center/domain/faq";
import { searchFaq } from "@/features/help-center/domain/faq-search";
import { FaqAccordion } from "@/features/help-center/ui/faq-accordion";

/**
 * Every question with its words resolved, in authored order.
 *
 * Built on each render rather than memoised: twenty `t()` calls is nothing,
 * and memoising on `i18n.language` would be one more thing to get wrong when
 * the language changes under an open panel.
 */
export function useFaqEntries(): FaqEntry[] {
  const { t } = useTranslation("help");
  return FAQ_CATEGORIES.flatMap((category) =>
    category.questionIds.map((id) => ({
      id,
      categoryId: category.id,
      question: t(`faq.${category.id}.${id}.q`),
      answer: t(`faq.${category.id}.${id}.a`),
    })),
  );
}

/** The panel's "all questions" screen: the categories, in order, each with its own accordion. */
export function HelpFaq({ query, onAskUs }: { query: string; onAskUs: () => void }) {
  const { t } = useTranslation("help");
  const entries = useFaqEntries();
  const [openId, setOpenId] = useState<string | null>(null);
  const matches = searchFaq(entries, query);

  if (matches.length === 0) {
    return (
      <div className="grid gap-3 p-4">
        <p className="type-body">{t("searchNoResults", { query })}</p>
        <button type="button" onClick={onAskUs} className="type-body-medium text-left text-[var(--color-primary)] hover:underline">
          {t("searchNoResultsAction")}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-4">
      {FAQ_CATEGORIES.map((category) => {
        const inCategory = matches.filter((entry) => entry.categoryId === category.id);
        if (inCategory.length === 0) return null;
        return (
          <section key={category.id} className="grid gap-2">
            <h3 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t(`faq.${category.id}.title`)}
            </h3>
            <FaqAccordion
              entries={inCategory}
              openId={openId}
              onToggle={(id) => setOpenId((current) => (current === id ? null : id))}
            />
          </section>
        );
      })}
    </div>
  );
}
