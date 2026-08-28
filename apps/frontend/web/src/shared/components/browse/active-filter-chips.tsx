import type { ReactNode } from "react";

/**
 * Everything currently narrowing the list, each with its own way off.
 *
 * The hole this fills is the one the reference design also had: a reader could
 * set five filters and then had no way to see what was on, and no way to take
 * one off without going back to the sidebar and hunting for it. On a phone,
 * where the sidebar lives behind a sheet, that was the whole story.
 *
 * A `<ul>`, so it announces as "list, 3 items" and can be skipped.
 */
export function ActiveFilterChips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="flex list-none flex-wrap items-center gap-2 p-0">
      {children}
    </ul>
  );
}

/**
 * One narrowing.
 *
 * `remove` is the page's own `<Link>` back to the same URL without this one
 * parameter — built by `browseSearch`/`directorySearch` so it drops exactly
 * this filter and keeps every other.
 */
export function ActiveFilterChip({ label, remove }: { label: string; remove: ReactNode }) {
  return (
    <li className="type-caption inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-1.5 pr-1.5 pl-3.5 font-medium shadow-[var(--shadow-xs)]">
      {label}
      {remove}
    </li>
  );
}

/** The class the page puts on the chip's own remove `<Link>`. */
export const CHIP_REMOVE_CLASS =
  "grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--color-surface-raised)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-foreground)] hover:text-[var(--color-background)]";
