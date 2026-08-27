import type { ReactNode } from "react";
import {
  pageNumbers,
  type PageSlot,
} from "@/shared/components/browse/domain/page-numbers";

/**
 * Numbered paging.
 *
 * Replaces a bare previous/next pair, which could say how to step but never how
 * far there was to go — a reader on page one of eight had no way to learn there
 * were eight. It became possible only once both listings returned a `total`.
 *
 * `renderPage` rather than a `to`/`search` pair: each page's links are typed
 * against its own route and its own search model, and a shared component that
 * built them would have to erase both.
 */
export function Pager({
  total,
  pageSize,
  offset,
  label,
  renderPage,
  previous,
  next,
}: {
  total: number;
  pageSize: number;
  offset: number;
  label: string;
  renderPage: (slot: Exclude<PageSlot, "gap">) => ReactNode;
  previous?: ReactNode;
  next?: ReactNode;
}) {
  const slots = pageNumbers(total, pageSize, offset);
  if (slots.length === 0) return null;

  return (
    <nav aria-label={label} className="flex items-center justify-center gap-1.5 pt-9">
      {previous}
      {slots.map((slot, i) =>
        slot === "gap" ? (
          // Not a link, and not focusable: a "…" a keyboard user can reach is
          // a tab stop that goes nowhere.
          <span
            // The index is the only stable identity a gap has — there is no
            // page number behind it, and two gaps in one pager are otherwise
            // indistinguishable.
            key={`gap-${String(i)}`}
            aria-hidden="true"
            className="type-body-medium grid h-9 w-9 place-items-center text-[var(--color-muted-foreground)]"
          >
            …
          </span>
        ) : (
          renderPage(slot)
        ),
      )}
      {next}
    </nav>
  );
}

/**
 * One page number.
 *
 * The current page is filled, matching the sort segments rather than the CTA:
 * both are "which of these is on", and neither is an action.
 */
export function pagerPageClass(current: boolean): string {
  const base =
    "type-body-medium grid h-9 min-w-9 place-items-center rounded-[10px] border px-2.5 transition-colors";
  return current
    ? `${base} border-[var(--color-foreground)] bg-[var(--color-foreground)] font-semibold text-[var(--color-background)]`
    : `${base} border-transparent text-[var(--color-muted-foreground)] hover:border-[var(--color-border)] hover:bg-[var(--color-background)] hover:text-[var(--color-foreground)]`;
}

/** "Previous" / "Next", which are wider than a number and read as words. */
export const PAGER_EDGE_CLASS =
  "type-body-medium grid h-9 place-items-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-background)] px-4 transition-colors hover:border-[var(--color-muted-foreground)]";
