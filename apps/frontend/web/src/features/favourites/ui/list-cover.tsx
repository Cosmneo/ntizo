import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { FAVOURITE_COVER_TILES } from "@ntizo/shared/read-models";

/**
 * The little 2×2 mosaic that stands for one of somebody's lists.
 *
 * A column of lists is read by shape before it is read by name — "Casa nova"
 * and "Casa da praia" are two words apart and their pictures are not — so
 * every row carries the list's own most recent items rather than an icon that
 * is the same on all of them.
 *
 * **It draws what it has and never pads.** Two items draw two squares; the
 * remaining cells are the soft ground a photograph would have sat on. Filling
 * them with grey placeholders would say the list holds four things, two of
 * which failed to load.
 *
 * **An empty list is a different thing from a list with no photographs**, and
 * this is the one distinction the component exists to make. Eight listings
 * that all lack pictures come back with `coverUrls: []` and `itemCount: 8` —
 * drawing the empty mark for that is a lie about the list's contents — so the
 * mark is keyed off the count the caller passes, never off the urls.
 *
 * The tiles are `role="presentation"` with an empty `alt`: this sits inside
 * the row's own label, and four filenames read out before the name of the
 * list they belong to is noise, not a description.
 */
export function ListCover({
  urls,
  empty,
  className,
}: {
  /** The list's cover images, newest first. Server-capped at four; sliced here anyway. */
  urls: readonly string[];
  /** Whether the list holds nothing at all — `itemCount === 0`, not `urls.length === 0`. */
  empty: boolean;
  className?: string;
}) {
  /**
   * The urls a browser could not fetch, so a 404 shows the ground a
   * photograph would have sat on rather than the browser's broken-image
   * glyph — which is the one outcome `BrandImage` exists to refuse, and on
   * dev today the common one.
   *
   * Kept here rather than by reaching for `BrandImage` itself, because its
   * fallback is the brand mark and the brand mark inside a 21px cell of a
   * 42px mosaic is a smudge. A failed tile falls back to exactly what an
   * unfilled cell already draws.
   *
   * The *url* that failed, not a boolean per index — the same distinction
   * `BrandImage` makes, and it matters here for the reason this component's
   * key already names: two listings in one list can share a photograph, and
   * one that 404s 404s in both cells.
   */
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);

  const box = cn(
    "h-[42px] w-[42px] shrink-0 overflow-hidden rounded-[9px] bg-[var(--color-muted)]",
    className,
  );

  if (empty) {
    return (
      <span data-testid="cover-empty" className={cn(box, "grid place-items-center")}>
        {/* The outline of the thing the list is for. `aria-hidden` because
            the row's own words already say "Empty" beside it. */}
        <Heart
          aria-hidden="true"
          strokeWidth={1.6}
          className="h-4 w-4 fill-none text-[var(--color-headline)] opacity-40"
        />
      </span>
    );
  }

  return (
    // `gap-px` over the ground, so the photographs are separated by a hairline
    // of the same tint the unfilled cells show rather than by a border that
    // would only exist on some of the four edges.
    <span className={cn(box, "grid grid-cols-2 grid-rows-2 gap-px")}>
      {urls.slice(0, FAVOURITE_COVER_TILES).map((url, index) =>
        // The index too, not the url alone: two listings saved to the same
        // list can share a photograph — a provider's own picture standing in
        // for two of its services — and a duplicate key is a React warning
        // over a mosaic that then drops a tile. The order is the server's
        // and this list is never reordered on the client, which is the
        // condition an index key asks for.
        failedUrls.includes(url) ? (
          // Still a cell, not nothing: removing the element would let grid
          // auto-placement pull the tiles after it forward, so one broken
          // photograph would rearrange the other three.
          <span key={`${index}-${url}`} aria-hidden="true" />
        ) : (
          <img
            key={`${index}-${url}`}
            src={url}
            alt=""
            role="presentation"
            className="h-full w-full object-cover"
            onError={() =>
              setFailedUrls((held) => (held.includes(url) ? held : [...held, url]))
            }
          />
        ),
      )}
    </span>
  );
}
