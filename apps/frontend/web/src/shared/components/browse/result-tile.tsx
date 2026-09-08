import { Star } from "lucide-react";
import { formatRating } from "@/shared/domain/rating";

/**
 * The whole-card link, carried by the title.
 *
 * Neither `ServiceCard` nor `ProviderCard` wraps itself in an anchor: a
 * keyboard reader gets one tab stop for the destination this way, and an
 * anchor around the whole card could not contain a second control if one is
 * ever added back.
 *
 * The focus ring is drawn on the `::after` rather than on the link, because
 * the `::after` is the shape the reader is actually about to open — the
 * whole card — while the link's own box is a few words of title. Headline
 * navy, not the ring token, because the ring token is the site's blue — the
 * header's and the search bar's button's — and nothing in the results wears
 * it.
 */
export const TILE_TITLE_LINK_CLASS =
  "after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--color-headline)] focus-visible:after:ring-offset-2";

/**
 * A score, with the sentence that says whose it is.
 *
 * `label` is the whole `aria-label`, translated by the caller: on a service
 * card this number is the *provider's* average across everything they sell,
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
