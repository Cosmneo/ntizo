import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";

/**
 * The one search box, on every screen that shows FAQ results.
 *
 * It reads and writes `help.query` directly rather than taking props: the
 * query lives in the panel's context precisely so the home screen and the
 * FAQ screen are searching the same thing, and a copy passed down would be
 * a second answer to that question.
 *
 * The FAQ screen needs it as much as home does. Without it, a reader who
 * clicked a popular question (which sets the query and navigates here)
 * landed on one result and nineteen missing ones, with no field explaining
 * why and no way back to the full list but the Back button.
 */
export function HelpSearchField() {
  const { t } = useTranslation("help");
  const help = useHelpCenter();
  return (
    <label className="relative block">
      <span className="sr-only">{t("searchLabel")}</span>
      <Search
        aria-hidden="true"
        className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]"
      />
      <input
        type="search"
        value={help.query}
        onChange={(event) => help.setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] py-2.5 pr-3.5 pl-9 placeholder:text-[var(--color-muted-foreground)] focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
      />
    </label>
  );
}
