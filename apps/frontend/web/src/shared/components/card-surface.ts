/**
 * The card every block on the public pages is drawn on — its edge and its
 * ground, without the padding.
 *
 * Split from `CARD_SURFACE_CLASS` for the cases that own their own padding
 * because something inside them has to fill the card: the FAQ's rows, where
 * the whole header is a button and the padding belongs to the button, not to
 * the row around it. A card whose padding sits on the wrapper gives that
 * button a dead margin the reader can press and nothing happens.
 *
 * **`bg-[var(--color-card)]` matters more than it looks.** On a white page the
 * card's ground and the page's are the same colour and the border is doing all
 * the work — but in dark mode the two part company, and a card left
 * transparent there reads as a rectangle drawn on nothing.
 */
export const CARD_EDGE_CLASS =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)]";

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
 * Roomier cards append their own padding (`${CARD_SURFACE_CLASS} md:p-8`) —
 * the later class wins, so the `p-5` here is a floor, not a fight.
 */
export const CARD_SURFACE_CLASS = `${CARD_EDGE_CLASS} p-5`;
