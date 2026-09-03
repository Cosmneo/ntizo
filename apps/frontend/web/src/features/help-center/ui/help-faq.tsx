import { useTranslation } from "react-i18next";
import { useState } from "react";
import { FAQ_CATEGORIES, type FaqEntry } from "@/features/help-center/domain/faq";
import { searchFaq } from "@/features/help-center/domain/faq-search";
import { FaqAccordion } from "@/features/help-center/ui/faq-accordion";
import { HelpSearchField } from "@/features/help-center/ui/help-search-field";

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

/**
 * The panel's "all questions" screen: the categories, in order, each with its
 * own accordion.
 *
 * `showSearch` because this component has two callers with two different
 * surroundings. The home screen renders it *below* its own search field, as
 * the live result of what is being typed. The FAQ screen renders it alone —
 * and until it carried a field of its own, a reader who arrived by clicking
 * a popular question (which sets the query and navigates here) saw one
 * question, nineteen missing, nothing saying a filter was on, and no way to
 * clear it but Back.
 */
export function HelpFaq({
  query,
  onAskUs,
  showSearch = false,
}: {
  query: string;
  onAskUs: () => void;
  showSearch?: boolean;
}) {
  const { t } = useTranslation("help");
  const entries = useFaqEntries();
  const matches = searchFaq(entries, query);

  return (
    <div className="grid gap-4 p-4">
      {showSearch && <HelpSearchField />}
      {matches.length === 0 ? (
        <div className="grid gap-3">
          <p className="type-body">{t("searchNoResults", { query })}</p>
          <button type="button" onClick={onAskUs} className="type-body-medium text-left text-[var(--color-primary)] hover:underline">
            {t("searchNoResultsAction")}
          </button>
        </div>
      ) : (
        // Keyed by the query so the open answer resets with it: `openId`'s
        // initial value below is derived from the search, and derived
        // initial state only re-derives across a remount.
        <FaqResults key={query} matches={matches} />
      )}
    </div>
  );
}

/**
 * The matches, grouped by category, with one answer open at a time.
 *
 * A search that narrows to a single question opens it — which is what
 * `faq-accordion.tsx`'s doc comment has always claimed and, until this
 * seeding existed, was not true of either caller: clicking a popular
 * question made the reader click the very same question a second time to
 * read the answer they had just asked for. A search with several matches
 * opens none of them; picking for the reader there would be a guess.
 */
function FaqResults({ matches }: { matches: readonly FaqEntry[] }) {
  const { t } = useTranslation("help");
  const [openId, setOpenId] = useState<string | null>(
    matches.length === 1 ? (matches[0]?.id ?? null) : null,
  );

  return (
    <div className="grid gap-5">
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
