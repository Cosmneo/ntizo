import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

interface ServiceSearchProps {
  /** Seeds the field — the current `?q=` when rendered on the results page. */
  initialValue?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * The one search field, used on the home page and again on the results page.
 *
 * A single input, not the four-part what/where/when/who bar it replaces: the
 * other three had nothing behind them, and a form that asks for a date before
 * it can answer "who fixes taps" makes the user do the work of a filter that
 * does not exist yet.
 *
 * Submitting navigates to `/services?q=`, which is what the field has always
 * said it does: the placeholder asks for a service and the button is labelled
 * "search services".
 *
 * It used to go to `/providers`, and the comment here explained why — there
 * was no Service aggregate to search. There is now, `/services` has taken a
 * `q` since the browse page shipped, and the redirect had quietly become the
 * kind of thing that makes a search box feel broken: you ask for "corte de
 * cabelo" and land on a list of businesses instead of the haircuts you asked
 * for.
 */
export function ServiceSearch({
  initialValue = "",
  className,
  autoFocus,
}: ServiceSearchProps) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const [value, setValue] = useState(initialValue);

  // Follow the URL when it changes underneath us — back/forward, or a second
  // search from the results page. Without this the field keeps the old term
  // while the list below it shows the new one.
  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        // An empty search still navigates: somebody who clears the box and
        // presses the button is asking to browse everything, and leaving them
        // on the home page reads as the button having failed.
        navigate({ to: "/services", search: q ? { q } : {} });
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-full border border-[var(--color-border)]",
        "bg-[var(--color-background)] p-2 pl-5 shadow-sm",
        className,
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-[var(--color-muted-foreground)]" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        {t("searchAction")}
      </button>
    </form>
  );
}
