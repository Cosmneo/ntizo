import type { ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * A business, as a row.
 *
 * A row rather than the tile a service gets, because a business needs more
 * words than a service: what it is, where it is, what it sells and for how
 * much. Given a tile's width those lines wrap into a paragraph; given a row's
 * they read.
 *
 * Separated from its neighbours by a hairline and nothing else. The design this
 * replaces drew a bordered card with a shadow, which is three separations doing
 * one job.
 */
export function ResultRow({
  media,
  favourite,
  title,
  kind,
  description,
  services,
  side,
  first = false,
}: {
  media: ReactNode;
  /**
   * The heart, or nothing — drawn over the photograph, never in the words.
   *
   * A slot of the row's rather than something the caller buries in its own
   * `media` node, so both result shapes place the one control on a result by
   * one rule: `TileMedia` holds a tile's, this holds a row's, and a third
   * shape cannot drift. A node rather than a `saved` flag because the marks
   * for a whole page come from one query in the page — see
   * `useFavouriteMarks`.
   */
  favourite?: ReactNode;
  /** An `h3` holding the route-typed title link and, when earned, the seal. */
  title: ReactNode;
  kind: ReactNode;
  description: ReactNode;
  /** Up to three service chips and the "+n". */
  services: ReactNode;
  /** Rating, price, and the chevron. */
  side: ReactNode;
  /**
   * Whether this is the first row of its list, which is the one row with
   * nothing above it to be separated from.
   *
   * **Told, never guessed.** This was a `first:` variant, which reads the
   * *DOM* parent — and a list of rows is `<ul><li><article>`, so every
   * article is the first child of its own `<li>` and the variant stripped the
   * hairline from every row in the list. The page is the only thing that
   * knows which row is actually first, so the page says so.
   */
  first?: boolean;
}) {
  return (
    <article
      className={cn(
        "group relative grid gap-7 border-t border-[var(--color-border)] py-6 md:grid-cols-[284px_minmax(0,1fr)_190px]",
        // `cn` is `twMerge`, so this genuinely replaces `border-t` rather than
        // racing it in the stylesheet: a first row's class list ends up with
        // `border-t-0` and no `border-t` at all.
        first && "border-t-0 pt-1",
      )}
    >
      {/* The media cell: the photograph, and the heart standing on it.
          `relative` is the positioning context the heart resolves against —
          without it the heart would find the `<article>` and land at the top
          right of the whole row.

          `grid` restores what the photograph had when it was the grid item
          itself: a single stretched child, so a media node with an aspect
          ratio still fills the row's height exactly as it did before this
          wrapper existed. A plain block here would have let the picture keep
          its ratio and leave a band of ground under it on any row whose text
          runs taller. */}
      <div className="relative grid">
        {media}
        {favourite}
      </div>
      <div className="grid min-w-0 content-start gap-1.5 pt-0.5">
        {title}
        {kind}
        {description}
        {services}
      </div>
      {side}
    </article>
  );
}

/** One service the business sells, with what it costs. */
export function ServiceChip({ name, price }: { name: string; price: string }) {
  return (
    <li className="inline-flex items-baseline gap-2 whitespace-nowrap rounded-[8px] bg-[var(--color-muted)] px-2.5 py-1.5 text-[13px]">
      {name}
      <b className="font-bold text-[var(--color-headline)] tabular-nums">{price}</b>
    </li>
  );
}
