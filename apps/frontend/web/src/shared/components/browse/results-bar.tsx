import type { ReactNode } from "react";

/**
 * The line between the filters and the first result.
 *
 * It answers two questions and no others: how many results there are, and what
 * order they are in. The count states the *total*, never the length of this
 * page — `items.length` told somebody with 40 matches that they had 24, which
 * is the page size talking rather than the search.
 */
export function ResultsBar({
  summary,
  sortLabel,
  children,
}: {
  summary: ReactNode;
  /** Names the sort control for assistive technology. */
  sortLabel: string;
  /** The page's own route-typed sort `<Link>`s. */
  children: ReactNode;
}) {
  return (
    // Two rows on a phone and one from `sm` up, as the mockup draws it. Side
    // by side at 360px the count and five orders do not fit, and there is no
    // arrangement of them that does.
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="type-body text-[var(--color-muted-foreground)]">{summary}</p>
      {/* Scrolls rather than wraps. Five orders at 360px wrap onto a second
          row and push the first result off the screen.

          `min-w-0` and `max-w-full`, never `shrink-0`: a flex item that refuses
          to shrink never reaches its own `overflow-x-auto`, so the control kept
          its full width and took the *page* sideways with it instead — 449px of
          document in a 360px window, and every section of the page scrollable
          off the right edge. */}
      <nav
        aria-label={sortLabel}
        className="flex w-full max-w-full min-w-0 gap-1 overflow-x-auto rounded-full border border-[var(--color-border)] bg-[var(--color-background)] p-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </nav>
    </div>
  );
}

/**
 * One order, as a segment of the control.
 *
 * The active one is filled with the foreground colour rather than the brand
 * blue: every CTA on the cards below is brand blue, and a sort pill in the same
 * colour reads as a second call to action rather than as a setting.
 */
export function segmentClass(active: boolean): string {
  const base = "type-body-medium whitespace-nowrap rounded-full px-4 py-1.5 transition-colors";
  return active
    ? `${base} bg-[var(--color-foreground)] font-semibold text-[var(--color-background)]`
    : `${base} text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]`;
}
