import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/** How far one press of an arrow moves the strip. */
const SCROLL_STEP = 320;

/**
 * The categories, as a band under the header — icon-over-label items with an
 * underline for the chosen one, rather than the rail's row of bordered pills.
 *
 * Navigation between whole result sets — the same weight as the site header
 * above it — rather than one control among several inside the results. The
 * facets narrow a list; this changes which list.
 *
 * It scrolls sideways rather than wrapping: a band that grows to two rows
 * pushes the results down by a different amount at every screen width, and the
 * categories past the fold are the rarer ones.
 *
 * White with a bottom hairline, not the rail's tinted ground: the search that
 * used to live in a card straddling this band's top edge now lives in the
 * header itself (see `SearchPill`), so there is no card left either to
 * disappear into on white or to leave clearance for — the padding above the
 * items is symmetric (see the scroller below).
 *
 * The fades and the arrows are the difference between a scroll container and a
 * finished one: without them the row simply ends mid-item, which reads as a
 * clipping bug rather than as more content.
 */
export function CategoryStrip({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (by: number) => scroller.current?.scrollBy({ left: by, behavior: "smooth" });

  return (
    <nav
      aria-label={label}
      className="relative border-b border-[var(--color-border)] bg-[var(--color-background)]"
    >
      {/* The positioned layer the fades and arrows are measured against,
          `page-shell` wide so they land at the edge of the *items*, not the
          edge of the screen — on a wide monitor those are two different
          lines, and an arrow sitting 12px from the browser chrome while the
          row it scrolls starts hundreds of pixels further in reads as a
          stray control, not as part of the strip.

          `pointer-events-none` on the box itself: it spans the whole centred
          column rather than a corner-sized square, and a transparent layer
          that size sitting above the items would eat every click on the row
          it is only meant to decorate. Each `StripArrow` opts back in for
          itself. `inset-0` rather than an inset top: unlike the rail, this
          band's padding is symmetric (see the scroller below), so the layer
          can simply fill the nav to stay centred on the item row. */}
      <div className="page-shell pointer-events-none absolute inset-0">
        <Fade side="left" />
        <Fade side="right" />

        <StripArrow side="left" onClick={() => nudge(-SCROLL_STEP)} />
        <StripArrow side="right" onClick={() => nudge(SCROLL_STEP)} />
      </div>

      {/* `sm:px-14`: clears the arrows above (36px wide, inset 12px, so they
          end 48px in from this same edge) by the same 56px the fade already
          uses, so an item can't land under either arrow, at rest or scrolled
          to either end. `sm`-only because that's the only range with arrows
          to clear — below it there's nothing to give way to, so the row stays
          flush with the content column, exactly as on a phone.

          `pt-3.5` is the band's only padding: each item closes its own
          bottom with `pb-3` and a 2px bottom border (see `categoryItemClass`),
          so the scroller needs no matching bottom utility of its own — unlike
          the rail, nothing above this band needs extra top clearance either,
          so the split is symmetric rather than the rail's `pt-10`/`pb-4`.

          `lg:justify-center-safe`, not `lg:justify-center`: a short category
          list should sit centred under the page rather than hugging the left
          edge with empty space to its right. Plain `justify-center` on a
          *scrolling* flex container is a standing browser bug, not a style
          choice — once the items overflow, the portion that overflows to the
          left is pushed before the container's own scroll start, and nothing
          can scroll back far enough to reach it, so the first categories
          become permanently unreachable the moment the catalogue outgrows the
          dev seed data. `-safe` centres only while every item already fits
          and falls back to start alignment the instant it doesn't, which is
          centred *and* keeps the whole row reachable — do not "simplify"
          this back to `justify-center`, it only looks equivalent with a
          handful of categories. Below `lg` the row stays start-aligned,
          unchanged: on a phone the first item should sit flush with the
          content column, where the eye already is. */}
      <div
        ref={scroller}
        data-testid="strip-scroller"
        className="page-shell flex gap-2 overflow-x-auto pt-3.5 sm:px-14 lg:justify-center-safe [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </nav>
  );
}

function Fade({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 w-14",
        side === "left"
          ? "left-0 bg-gradient-to-r from-[var(--color-background)] to-transparent"
          : "right-0 bg-gradient-to-l from-[var(--color-background)] to-transparent",
      )}
    />
  );
}

/**
 * Hidden from assistive technology and out of the tab order on purpose.
 *
 * A keyboard reader reaches every item by tabbing, and the container scrolls to
 * follow focus; two extra stops that scroll a list they are already walking add
 * nothing. This is a mouse affordance and only a mouse affordance — which is
 * also why it is drawn only from `sm` up.
 */
function StripArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      data-testid={`strip-arrow-${side}`}
      aria-hidden="true"
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        "pointer-events-auto absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full sm:grid",
        "border border-[var(--color-border)] bg-[var(--color-background)] shadow-[var(--shadow-sm)]",
        "transition-colors hover:border-[var(--color-muted-foreground)]",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * One category item: an icon over a label, with an underline for the chosen
 * one.
 *
 * The chosen state changes colour and the underline only — never the border
 * width, the padding, the gap or the weight. An item that grows shifts every
 * item after it, and the whole row jumps sideways as the selection moves;
 * bold glyphs are wider than medium ones in every non-monospace face, so
 * `font-semibold` on the chosen item was that same jump by another route.
 */
export function categoryItemClass(active: boolean): string {
  const base =
    "flex shrink-0 flex-col items-center gap-[7px] whitespace-nowrap border-b-2 pb-3 text-[12.5px] font-medium transition-colors";
  return active
    ? `${base} border-[var(--color-headline)] text-[var(--color-headline)]`
    : `${base} border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]`;
}
