/**
 * The card every block on the public pages is drawn on.
 *
 * A class rather than a component, for the same reason `facetOptionClass` and
 * `TILE_TITLE_LINK_CLASS` are classes: what goes inside differs everywhere —
 * a review, a step, a principle, a way to reach support — and only the page
 * knows what that is. This owns the edge, the ground and the padding, and
 * nothing else.
 *
 * It is the listings' own card, the one `ServiceCard` and `ProviderCard` are
 * built from and the one the home's reviews adopted on 2026-09-07. Written
 * down here so the pages that came to it afterwards copy a value instead of a
 * guess: a hairline border, not a shadow; `--radius-card`, not a radius per
 * page; `--color-card`, which is white in light mode and a raised surface in
 * dark, rather than a literal.
 *
 * **`bg-[var(--color-card)]` matters more than it looks.** On a white page the
 * card's ground and the page's are the same colour and the border is doing all
 * the work — but in dark mode the two part company, and a card left
 * transparent there reads as a rectangle drawn on nothing.
 */
export const CARD_SURFACE_CLASS =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[var(--color-card-foreground)]";
