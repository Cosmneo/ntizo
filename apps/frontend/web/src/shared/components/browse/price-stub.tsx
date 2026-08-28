import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

export interface StubRating {
  average: number;
  count: number;
  /**
   * Names whose score this is — "provider rating" on a service card.
   *
   * Omitted where the score belongs to the listing itself. A provider card
   * shows its own reviews and needs no explanation; a service card shows its
   * *business's* reviews, and printing those unlabelled claims the service has
   * been reviewed six times when it has not been reviewed at all.
   */
  attribution?: string | undefined;
}

/**
 * The price rail of a listing card, drawn as a ticket stub.
 *
 * The dashed rule and the two punched notches are the design's one deliberate
 * flourish, and they are structural rather than applied: what this platform
 * sells is a *committed offer* — a price and a duration fixed before you agree,
 * in a market whose norm is to negotiate on the doorstep — and a stub is what a
 * committed offer looks like.
 *
 * The notch is a circle in the page's ground colour sitting on the rule at each
 * card edge, half inside the card and half out. It is only legible because the
 * ground and the card are different colours, which is the same reason the whole
 * page moved onto `--color-surface-raised`; it carries a 1px ring so the half
 * lying on white still reads as a hole rather than as a smudge.
 *
 * Every optional slot collapses. Most listings carry no rating and no
 * under-line, and a fixed-height rail would put a band of empty white inside
 * every card shorter than the tallest in its column.
 *
 * `amount` arrives already formatted. `Intl.NumberFormat` needs a locale and a
 * currency, and a presentational shell that reached for either would be
 * deciding something the two pages should decide for themselves.
 */
export function PriceStub({
  rating,
  eyebrow,
  amount,
  under,
  action,
}: {
  rating?: StubRating | undefined;
  /** "Fixed price", "Per hour", "By quote", "from" — above the amount. */
  eyebrow: string;
  amount: string;
  /** One line under the amount: "45 min", "per service". */
  under?: string | undefined;
  /** The page's own route-typed CTA `<Link>`. */
  action: ReactNode;
}) {
  const { t } = useTranslation("directory");

  return (
    <div
      data-testid="price-stub"
      // One row of two columns on a phone, a column of rows from `md` up — the
      // mockup's `.mstub` against its `.stub`. Stacked at both widths it drew
      // six right-aligned lines and about 130px of every card, against the
      // mockup's 56: on a screen where the whole card is 358px wide, a quarter
      // of each result spent saying one price.
      //
      // `items-end` is unprefixed because it means the right thing in both
      // directions — the bottoms line up in the row, the contents sit right in
      // the column — and gating it behind `md:` would leave the phone row on
      // `stretch`, which is not what the mockup draws.
      //
      // `min-w-0` is what keeps the row from taking the whole page sideways. The
      // card is a one-column grid on a phone and a grid track's automatic
      // minimum is its item's min-content, so turned into a row this stub's
      // min-content became the *sum* of its columns rather than the widest of
      // its stacked rows: on `/providers`, whose CTA reads "Ver negócio" and
      // cannot wrap, the card grew 22px past its own list and the document
      // scrolled sideways. The same trap `ListingCard`'s `minmax(0,1fr)`
      // comment describes, one level down. `flex-wrap` is the floor under it —
      // a translation long enough to beat both still wraps rather than overlaps.
      className="relative flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-4 md:flex-col md:flex-nowrap md:pt-0 md:pl-5 lg:pl-6"
    >
      {/* The perforation. A zero-width span with a left border rather than a
          dashed border on the container: a dashed border on the flex parent
          would also dash the three edges nobody asked for.

          Horizontal on a phone, where the stub sits under the body rather than
          beside it — the same rule, turned. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute border-dashed border-[var(--color-border-strong)]",
          "inset-x-0 top-0 h-0 border-t-[1.5px]",
          "md:inset-x-auto md:inset-y-[-2px] md:top-auto md:left-0 md:h-auto md:w-0 md:border-t-0 md:border-l-[1.5px]",
        )}
      />
      <Notch className="top-[-6px] left-[-22px] md:top-[-23px] md:left-[-6px]" />
      <Notch className="top-[-6px] right-[-22px] md:top-auto md:right-auto md:bottom-[-23px] md:left-[-6px]" />

      {/* The price column of the phone row, and nothing at all from `md` up:
          `md:contents` dissolves this wrapper so the desktop column stays the
          three siblings it has always been.

          It exists because the mockup's `.mstub` is two columns and this has
          three things to place — the mockup keeps its rating up in the card's
          meta line, and a service card has no meta line to keep it in. Left as
          a third column it did not fit: 66 + 105 + 135 and two gaps against the
          278px a card has at 360, and what does not fit in a flex row overlaps.
          The "Ver negócio" button sat on top of "1200 MZN". */}
      <div className="grid min-w-0 gap-0.5 md:contents">
        {rating && (
          <p
            data-testid="stub-rating"
            className="grid justify-items-start gap-0.5 md:justify-items-end"
            // One label for the pair. Five icons read out one by one are not a
            // rating, and the number alone loses the count — 4.9 from two people
            // and 4.9 from two hundred are different claims.
            aria-label={t("providerRatingLabel", {
              score: rating.average.toFixed(1),
              count: rating.count,
            })}
          >
            <span className="flex items-center gap-1.5">
              <Star
                className="h-3.5 w-3.5 fill-[var(--color-warning)] text-[var(--color-warning)]"
                aria-hidden="true"
              />
              <b className="font-rounded text-[0.95rem] font-semibold tabular-nums">
                {rating.average.toFixed(1)}
              </b>
              <span className="type-caption text-[var(--color-muted-foreground)]">
                ({rating.count})
              </span>
            </span>
            {rating.attribution && (
              <span className="type-caption text-[var(--color-muted-foreground)]">
                {rating.attribution}
              </span>
            )}
          </p>
        )}

        {/* Flush left on a phone, flush right in the desktop column — the
            mockup's `.mstub .price-block { text-align: left }` against its
            `.stub`. Right-aligned inside a left-hand column, the four lines are
            ragged against nothing and read as a mistake. */}
        <p className="grid justify-items-start gap-0.5 text-left md:justify-items-end md:text-right">
          <span className="text-[11px] font-medium tracking-[0.09em] text-[var(--color-muted-foreground)] uppercase">
            {eyebrow}
          </span>
          <b className="font-rounded text-[1.45rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
            {amount}
          </b>
          {under && (
            <span
              data-testid="stub-under"
              className="type-caption text-[var(--color-muted-foreground)]"
            >
              {under}
            </span>
          )}
        </p>
      </div>

      {/* `relative` so it sits above the card's whole-surface title link. A CTA
          underneath that overlay is a button nobody can press.

          Content-width on a phone (`.mstub .cta { width: auto }` in the
          mockup), because there it is the right-hand column of the stub's one
          row rather than the last line of a stack. `shrink-0` because its label
          cannot wrap, so it is the two text blocks beside it that must give way;
          `ml-auto` keeps it on the right on the wrapped line too. */}
      <div
        data-testid="stub-action"
        className="relative ml-auto w-auto shrink-0 md:ml-0 md:w-full"
      >
        {action}
      </div>
    </div>
  );
}

/** One punched hole where the perforation meets a card edge. */
function Notch({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute h-3 w-3 rounded-full bg-[var(--color-surface-raised)] shadow-[0_0_0_1px_var(--color-border)]",
        className,
      )}
    />
  );
}

/**
 * The stub's call to action, as a class rather than a component.
 *
 * Each page's CTA is a route-typed `<Link>` — `/services/$id` on one,
 * `/providers/$slug` on the other — and wrapping those in a shared component
 * would erase the typing that makes a broken link a build failure.
 *
 * `quiet` is for a destination that cannot be paid for: a solid brand-blue
 * button beside a price of "to agree" promises a checkout that does not exist
 * for that listing.
 *
 * `whitespace-nowrap`: "Pedir orçamento" wrapped onto two lines inside a 196px
 * rail and turned the button into a paragraph with a border.
 */
export function stubCtaClass(variant: "primary" | "quiet" = "primary"): string {
  const base =
    "font-rounded inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-field)] px-3.5 py-3 text-sm font-semibold transition-[background-color,transform,border-color]";
  return variant === "primary"
    ? `${base} bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:-translate-y-px hover:bg-[var(--color-primary-deep)]`
    : `${base} border border-[var(--color-border-strong)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:border-[var(--color-foreground)] hover:bg-[var(--color-foreground)] hover:text-[var(--color-background)]`;
}
