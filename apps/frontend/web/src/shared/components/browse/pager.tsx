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
 * One page number, as a round.
 *
 * The current page is filled headline navy — the same fill an applied filter
 * pill and the phone's floating control wear, because all three say "this one
 * is on" rather than "press me". The rest carry no border at all: a row of
 * outlined boxes reads as eight buttons competing with the results above
 * them, where the numbers are only a place in a list.
 *
 * Only the colours move between the two states, never the size — a number
 * that grew when it became current would shift every number after it as the
 * reader paged, which is the same rule `quickChipClass` and
 * `facetOptionClass` follow. The weight is the size: both states take
 * `type-body-medium`'s 500 and neither adds a `font-*` of its own, which is
 * what the `font-bold` on the current page was quietly breaking.
 */
export function pagerPageClass(current: boolean): string {
  const base =
    "type-body-medium grid h-9 min-w-9 place-items-center rounded-full px-2.5 transition-colors";
  return current
    ? `${base} bg-[var(--color-navy-surface)] text-[var(--color-navy-on)]`
    : `${base} text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]`;
}

/** "Previous" / "Next", which are wider than a number and read as words. */
export const PAGER_EDGE_CLASS =
  "type-body-medium grid h-9 place-items-center rounded-full border border-[var(--color-border-strong)] px-4 transition-colors hover:border-[var(--color-headline)]";
