import type { ReactNode } from "react";

/**
 * The line between the filters and the first result.
 *
 * It answers two questions and no others: how many results there are, and what
 * order they are in. The count states the *total*, never the length of this
 * page — `items.length` told somebody with 40 matches that they had 24, which
 * is the page size talking rather than the search.
 *
 * `children` is no longer wrapped in a `<nav aria-label="Sort">`. That
 * landmark earned its place when this held a row of 3–5 destination links —
 * genuinely a small menu of places to go, worth naming for a screen reader
 * skimming landmarks. `SortDropdown` is one button with its own accessible
 * name; it is a setting, not somewhere to navigate, and a `nav` around it
 * would announce a second menu that is not there. `overflow-x-auto` is gone
 * with it — that existed so five pills could scroll sideways instead of
 * wrapping onto a second row and pushing the first result off a 360px screen,
 * and one trigger is narrower than the row it replaced ever needed a whole
 * width for.
 */
export function ResultsBar({
  summary,
  children,
}: {
  summary: ReactNode;
  /** The page's own sort control — one trigger button, not a row of links. */
  children: ReactNode;
}) {
  return (
    // `flex-wrap` rather than the forced `flex-col`/`sm:flex-row` stack this
    // replaced: that stack existed because five pills needed a row of their
    // own. One trigger fits beside the count at every width the pills needed
    // splitting for; wrapping stays as the fallback for whatever the count's
    // own text does at a width nobody has tried.
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="type-body text-[var(--color-muted-foreground)]">{summary}</p>
      {children}
    </div>
  );
}
