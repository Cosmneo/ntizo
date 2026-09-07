import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";
import { formatRating } from "@/shared/domain/rating";

/**
 * The whole-tile link, carried by the title.
 *
 * The tile is not wrapped in an anchor: a keyboard reader gets one tab stop for
 * the destination this way, and an anchor around the whole thing could not
 * contain a second control if one is ever added back.
 *
 * The focus ring is drawn on the `::after` rather than on the link, because
 * the `::after` is the shape the reader is actually about to open — the whole
 * tile or row — while the link's own box is a few words of title. Turning the
 * native outline off without putting anything in its place is what the card
 * this replaces could afford: its `<article>` carried
 * `focus-within:border-…`, and the borderless tile carries nothing. Headline
 * navy, not the ring token, because the ring token is the site's blue — the
 * header's and the search bar's button's — and nothing in the results wears
 * it.
 */
export const TILE_TITLE_LINK_CLASS =
  "after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--color-headline)] focus-visible:after:ring-offset-2";

/**
 * The photograph, or the site's own placeholder when there is none.
 *
 * Square on a phone, four-by-three from `sm` up, because the tile itself
 * changes shape there: below `sm` it is a 116px-square photo with the words
 * beside it, and above it the photo is the top of a tile with the words under
 * it. One responsive box rather than a `ratio` prop — the prop existed, no
 * caller ever passed anything but the default, and the shape is a property of
 * the width rather than of the caller.
 *
 * It takes no `name`. It used to, to print initials on a listings-only tile;
 * the placeholder is now the one the whole product draws, which says nothing
 * about whose listing it is and does not need to be told.
 *
 * The box's own ground is `--color-muted`, the ground every other `BrandImage`
 * on the site paints behind a picture. It is what a reader sees while a photo
 * is still in flight and, for the moment before `onError` swaps the
 * placeholder in, behind a photo that will never arrive: navy there was a dark
 * box flashing in front of the placeholder's pale blue, on exactly the slow
 * connections this list is read on.
 */
export function TileMedia({ src }: { src: string | null }) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-[12px] bg-[var(--color-muted)]",
        "sm:aspect-[4/3] sm:rounded-[var(--radius-card)]",
      )}
    >
      {/* `alt=""` gives the `<img>` the implicit `presentation` role: the name
          is the heading right beside this, and repeating it is read twice and
          says nothing new either time. With no `fallback`, `BrandImage` draws
          its own `MediaFallback` — the pale-blue mark the landing cards and
          the checkout rail already show — both when there is no `src` and
          when the photo it was given 404s; a photo that fails to load is the
          same "no photo is a designed state" as one that was never there. The
          fallback wears this `className`, so it fills exactly the box the
          photograph would have. */}
      <BrandImage
        src={src}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
      />
    </div>
  );
}

/**
 * A score, with the sentence that says whose it is.
 *
 * `label` is the whole `aria-label`, translated by the caller: on a service
 * tile this number is the *provider's* average across everything they sell,
 * and a bare star beside a service's name claims a per-service rating this
 * product does not have.
 *
 * `locale` rather than a formatter of its own. This printed
 * `toFixed(1).replace(".", ",")` before — a comma in all eight locales, so an
 * en-US reader met "4,7" here and "4.7" on the same provider's page, and the
 * `aria-label` beside it said "4.7" in every locale because the caller built
 * that with `toFixed`. One function, `formatRating`, now writes both.
 */
export function RatingMark({
  average,
  count,
  label,
  locale,
}: {
  average: number;
  count?: number | undefined;
  label: string;
  /** The reader's locale — the separator is theirs, not Portuguese's. */
  locale: string;
}) {
  return (
    <span
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-semibold text-[var(--color-foreground)]"
    >
      <Star className="h-3 w-3 fill-[var(--color-warning)] text-[var(--color-warning)]" aria-hidden="true" />
      <span className="tabular-nums">{formatRating(average, locale)}</span>
      {count != null && (
        <span className="font-normal text-[var(--color-muted-foreground)]">({count})</span>
      )}
    </span>
  );
}

/**
 * A result: a photograph, then three lines.
 *
 * No border, no shadow, no card. The photograph is the separation, and white
 * space between tiles is the grid's. The design this replaces put every result
 * in a bordered box on a tinted ground, which is the shape of a template rather
 * than of a catalogue.
 *
 * **Two shapes, one component.** Below `sm` it is a hairline row — a 116px
 * square photo with the words beside it, four to a screen — and from `sm` up
 * it is the tile the desktop grid lays out, photo above and words below. A
 * phone showing one result per screen is the failure the whole redesign is
 * for. The hairline itself is the list's, not the row's: `divide-y` on the
 * `<ul>` draws between children, so the first row needs no special case.
 */
export function ResultTile({
  media,
  title,
  byline,
  price,
}: {
  media: ReactNode;
  /** An `h3` holding the route-typed title link. */
  title: ReactNode;
  /** Who provides it, their seal, their rating. Where it happens is the price line's job. */
  byline: ReactNode;
  price: ReactNode;
}) {
  return (
    <article className="group relative grid grid-cols-[116px_minmax(0,1fr)] gap-3.5 py-3.5 sm:block sm:py-0">
      {media}
      <div className="grid gap-[3px] pt-2.5">
        {title}
        {byline}
        {price}
      </div>
    </article>
  );
}
