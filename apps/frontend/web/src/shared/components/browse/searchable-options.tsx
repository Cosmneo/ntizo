import { Fragment, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

/**
 * How many options a group may hold before it grows a search field.
 *
 * Ten is where a list stops being something you read and starts being
 * something you scan. Below it a field is a control that filters a list the
 * reader can already see in full — it costs a row of the panel and answers a
 * question nobody asked. Above it the panel has to scroll, and scrolling is
 * where a name you know is harder to reach than a name you type.
 *
 * The threshold is counted, not configured, so a group grows the field by
 * itself as an administrator adds rows. Categories cross it somewhere around
 * the eleventh; the cities never will.
 */
export const OPTION_SEARCH_THRESHOLD = 10;

/**
 * Fold a label down to what a reader can be expected to type.
 *
 * Case, and accents. "Canalização" has to match `canalizacao`, because a
 * Portuguese keyboard makes the cedilla and the tilde work and a hurry does
 * not. `NFD` splits each accented letter into its base plus its mark, and the
 * mark is what gets dropped — one rule for every language the site carries
 * rather than a table of substitutions per locale.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * A group of filter options that filters itself once there are enough of it.
 *
 * The rows stay the page's own: this takes them already built, as `node`,
 * beside the `label` it matches against. That is the same division
 * `facetOptionClass` and `FilterPill` already keep — only the page knows the
 * route an option navigates to and the search it carries, so only the page
 * builds the `<Link>`. This owns the field, the matching and the empty state.
 *
 * **Everything renders when nothing is typed, and the field is the only thing
 * that hides anything.** The options are links a crawler should follow, and
 * they sit inside a `<details>` that keeps them in the document whether the
 * panel is open or shut. Without JavaScript the field simply does nothing and
 * the full list is what shows — the floor `FilterPill` was built to hold.
 */
export function SearchableOptions({
  options,
  searchLabel,
  searchPlaceholder,
  noMatchLabel,
  lead,
}: {
  options: ReadonlyArray<{ key: string; label: string; node: ReactNode }>;
  /** Names the field for a reader who cannot see the group's heading. */
  searchLabel: string;
  searchPlaceholder: string;
  /** What to say when a term matches none of them. Receives the term typed. */
  noMatchLabel: (term: string) => string;
  /**
   * The "All" row, which clears the group rather than choosing within it.
   *
   * Above the options and outside the matching, because it answers a
   * different question — and it hides while a term is typed, where a row
   * that ignores the term would be the one row on screen that does.
   */
  lead?: ReactNode;
}) {
  const [term, setTerm] = useState("");

  const searchable = options.length > OPTION_SEARCH_THRESHOLD;
  // The field only exists above the threshold, so a term left behind by a
  // list that has since shrunk must not go on filtering an unsearchable one.
  const needle = searchable ? normalizeForSearch(term.trim()) : "";
  const shown = needle
    ? options.filter((option) => normalizeForSearch(option.label).includes(needle))
    : options;

  return (
    <>
      {searchable && (
        <div className="relative mb-2.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            /* No `autoFocus`. The panel opens under a pill the reader just
               pressed, and stealing focus into a field moves the phone's
               keyboard over the very options they came to look at. */
            className="type-body-medium h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-background)] py-0 pr-2.5 pl-8 text-[var(--color-foreground)] transition-colors placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-headline)] focus:outline-none"
          />
        </div>
      )}

      {/* The cap is on the rows alone, so the field stays put while they
          scroll under it rather than leaving with them. */}
      <div className={searchable ? "grid max-h-[264px] overflow-y-auto" : "grid"}>
        {!needle && lead}
        {shown.map((option) => (
          <Fragment key={option.key}>{option.node}</Fragment>
        ))}
        {shown.length === 0 && (
          <p className="type-caption py-1.5 text-[var(--color-muted-foreground)]">
            {noMatchLabel(term.trim())}
          </p>
        )}
      </div>
    </>
  );
}
