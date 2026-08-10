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
 * Submitting navigates to `/providers?q=`. It searches providers rather than
 * services because there is no Service aggregate in the backend yet — the
 * placeholder says "service" because that is what a user is looking for, and
 * the destination changes without this component changing when it exists.
 */
export function ServiceSearch({ initialValue = "", className, autoFocus }: ServiceSearchProps) {
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
        navigate({ to: "/providers", search: q ? { q } : {} });
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
