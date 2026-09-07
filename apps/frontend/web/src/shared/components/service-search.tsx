import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/** What the field itself needs, wherever it is drawn. */
interface FieldProps {
  /** Seeds the field — the current `?q=` when rendered on the results page. */
  initialValue?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * The home page's hero: the services wording, and a submit that starts a
 * fresh search.
 *
 * Nothing to keep — there is no list under the hero whose narrowing a submit
 * could preserve — so all four of the list page's props are absent together.
 */
interface HeroProps {
  to?: undefined;
  placeholder?: undefined;
  label?: undefined;
  search?: undefined;
}

/**
 * A list page's bar: where it goes, what it asks for, what it announces, and
 * what it does with the term. The four arrive together because each one alone
 * is a bug this bar has already shipped.
 *
 * `to="/providers"` with the default label announced "Search services" over a
 * list of businesses — a placeholder is a hint the eye reads and a screen
 * reader may skip, so it is not an accessible name. And a submit with no
 * builder writes `?q=` and nothing else, throwing away the category, the
 * filters, the city and the sort the reader had set. Requiring the set makes
 * both unrepresentable rather than remembered.
 */
interface ListProps {
  /**
   * Where the term goes. `/services` searches services; `/providers`
   * searches businesses by name.
   */
  to: "/services" | "/providers";
  /** What the empty field asks for — the thing that list holds. */
  placeholder: string;
  /** The field's accessible name, which is what a screen reader announces. */
  label: string;
  /**
   * What the submitted term should become, as a search object.
   *
   * A list page passes its own builder so that submitting a term changes the
   * term and keeps the category, the filters, the city and the sort — the
   * same rule every other control on those pages follows. `shared/*` may not
   * import `features/*`, so building that URL is the page's job, not this
   * component's.
   *
   * The argument is `undefined` for an empty box, never `""`: an emptied box
   * clears the term rather than pinning `q=` to the URL.
   *
   * `object` rather than `Record<string, unknown>`, and no cast: the pages
   * return their own `BrowseSearch` / `DirectorySearch`, which are interfaces,
   * and an interface has no implicit index signature — so the tighter type
   * would reject both real callers and buy nothing this component can use.
   */
  search: (q: string | undefined) => object;
}

type ServiceSearchProps = FieldProps & (HeroProps | ListProps);

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
 * Submitting navigates to `/services?q=` by default, or to `/providers?q=`
 * for the businesses list, which is what the field says it does: the
 * placeholder asks for the thing that list holds and the button searches it.
 * `to` is a destination and not a mode — the markup, the drafts and the
 * submit are identical either way, so `/providers` gets the same bar the
 * landing hero draws rather than a second search component of its own, which
 * is exactly how the two browse pages each ended up with a private copy
 * before this.
 *
 * What a submit *keeps* is the caller's to decide, through `search`. From the
 * hero there is nothing to keep and the term is the whole URL. From a list
 * page the bar is one control among many, and every other one of them changes
 * a single part of the URL and keeps the rest — so the page hands over its own
 * builder and a submit keeps the category, the filters, the city and the sort,
 * and resets the page. Without that, typing a word on a narrowed list silently
 * handed the reader the whole platform back (7 September 2026).
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
  label,
  search: buildSearch = (q) => (q ? { q } : {}),
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
        // where they are reads as the button having failed. The builder is
        // told `undefined` rather than `""`, so a page's own builder omits
        // the term instead of writing `q=` into the URL.
        navigate({ to, search: buildSearch(q || undefined) });
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
        aria-label={label ?? t("searchLabel")}
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
