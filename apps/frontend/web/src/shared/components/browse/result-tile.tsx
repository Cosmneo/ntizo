import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { BrandTile } from "@/shared/components/browse/brand-tile";
import { BrandImage } from "@/shared/components/brand-image";

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
 * navy, not the ring token, because the ring token is the blue this page
 * spends on the header's search button and nowhere else.
 */
export const TILE_TITLE_LINK_CLASS =
  "after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--color-headline)] focus-visible:after:ring-offset-2";

/** The photograph, or the brand tile when there is none. */
export function TileMedia({
  src,
  name,
  ratio = "4/3",
}: {
  src: string | null;
  /** Whose listing this is — the brand tile prints its initials. */
  name: string;
  ratio?: "4/3" | "1/1";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-navy-surface)]",
        ratio === "4/3" ? "aspect-[4/3]" : "aspect-square",
      )}
    >
      {/* `alt=""` gives the `<img>` the implicit `presentation` role: the name
          is the heading right beside this, and repeating it is read twice and
          says nothing new either time. `BrandImage` swaps in `fallback` both
          when there is no `src` and when the photo it was given 404s — a
          photo that fails to load is the same "no photo is a designed state"
          as one that was never there. */}
      <BrandImage
        src={src}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        fallback={<BrandTile name={name} />}
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
 */
export function RatingMark({
  average,
  count,
  label,
}: {
  average: number;
  count?: number | undefined;
  label: string;
}) {
  return (
    <span
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-semibold text-[var(--color-foreground)]"
    >
      <Star className="h-3 w-3 fill-[var(--color-warning)] text-[var(--color-warning)]" aria-hidden="true" />
      <span className="tabular-nums">{average.toFixed(1).replace(".", ",")}</span>
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
    <article className="group relative">
      {media}
      <div className="grid gap-[3px] pt-2.5">
        {title}
        {byline}
        {price}
      </div>
    </article>
  );
}
