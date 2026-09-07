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
  /**
   * Where the term goes. The home page and `/services` search services;
   * `/providers` searches businesses by name.
   */
  to?: "/services" | "/providers";
  /** What the empty field asks for. Defaults to the services wording. */
  placeholder?: string;
}

/**
 * The one search field: the home page's hero, and again under the header on
 * each of the two browse pages.
 *
 * A single input, not the four-part what/where/when/who bar it replaces: the
 * other three had nothing behind them, and a form that asks for a date before
 * it can answer "who fixes taps" makes the user do the work of a filter that
 * does not exist yet. The city is not one of its fields either — it is the
 * browse pages' "Cidade" filter pill, which is where a narrowing belongs.
 *
 * Submitting navigates to `to?q=`, which is what the field says it does: the
 * placeholder asks for the thing that list holds and the button searches it.
 * `to` is a destination and not a mode — the markup, the drafts and the
 * submit are identical either way, so `/providers` gets the same bar the
 * landing hero draws rather than a second search component of its own, which
 * is exactly how the two browse pages each ended up with a private copy
 * before this.
 *
 * The default is `/services`, and used to be the only behaviour: it went to
 * `/providers` once, back when there was no Service aggregate to search, and
 * that redirect had quietly become the kind of thing that makes a search box
 * feel broken — you ask for "corte de cabelo" and land on a list of
 * businesses instead of the haircuts you asked for. The `/providers` page
 * asks for a business by name and says so in its own placeholder, which is
 * the difference between choosing a destination and being sent to one.
 */
export function ServiceSearch({
  initialValue = "",
  className,
  autoFocus,
  to = "/services",
  placeholder,
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
        // where they are reads as the button having failed.
        navigate({ to, search: q ? { q } : {} });
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-full border border-[var(--color-border)]",
        "bg-[var(--color-background)] p-2 pl-5 shadow-sm",
        className,
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-[var(--color-muted-foreground)]" />
      {/*
        The field names its own text colour. A form control inherits `color`
        from its container, and the home hero paints its block white; without
        this the typed text and the caret were white on the field's white
        background, and typing showed nothing (3 September 2026).
      */}
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
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
