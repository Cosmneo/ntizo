import type { ReactNode } from "react";

/**
 * A row of one-tap narrowings, above the results on a phone.
 *
 * A `<ul>`, so it announces as a list and can be skipped past — a reader who
 * does not want to narrow anything should not have to hear five links to find
 * the results. There is no exported item component to go with it: the children
 * are the page's own route-typed `<Link>`s, each carrying `quickChipClass`,
 * and this row does nothing but lay them out and let them scroll sideways
 * instead of wrapping onto a second row and pushing the first result down by a
 * different amount at every screen width.
 *
 * The fade at the right edge tells the reader this is a scroll container — the
 * row reads as a scroll container that ends mid-item on purpose, not as a
 * clipping bug — through a `mask-image` rather than an overlay span: this row
 * carries no positioned layer of its own for arrows to sit on, so one utility
 * on the list itself is the whole fix. One edge only, because a quick-filter
 * row starts flush with the content column and only ever runs off the right.
 */
export function QuickChips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="flex list-none gap-2 overflow-x-auto p-0 [-ms-overflow-style:none] [mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-56px),transparent_100%)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </ul>
  );
}

/**
 * The class each page puts on its own `<Link>`s inside `QuickChips`.
 *
 * Only the colour tokens move between the two states — never the padding or
 * the type size — so a chip going from off to on never resizes and shifts
 * every chip after it sideways, the same rule `pagerPageClass` follows.
 *
 * `whitespace-nowrap` is what actually keeps the row one row. `shrink-0` on
 * this link is not enough on its own: the flex item is the `<li>` the page
 * wraps around it, and a flex item's automatic minimum size is its
 * min-content width — one word wide, with wrapping allowed. Measured on a
 * 390px screen, every chip was 48px of `<li>` around a 57px two-line link
 * ("Fixed / price", "At your / place"). Forbidding the wrap makes the
 * min-content width the whole chip, so nothing can squeeze it.
 */
export function quickChipClass(active: boolean): string {
  const base =
    "shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-[13px] font-medium";
  return active
    ? `${base} border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] text-[var(--color-navy-on)]`
    : `${base} border-[var(--color-border-strong)] text-[var(--color-foreground)]`;
}
