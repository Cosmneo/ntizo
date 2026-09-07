import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Compass, Tag, icons } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/** How far one press of an arrow moves the strip. */
const SCROLL_STEP = 320;

/**
 * How many categories the strip offers.
 *
 * The same page size the category browse uses, so the two ask for one set and
 * share a cache entry rather than fetching overlapping halves.
 *
 * Here rather than in each page, where both carried the identical constant:
 * it is a fact about this strip, not about either route.
 */
export const CATEGORY_STRIP_LIMIT = 24;

/**
 * A Lucide name from the database, resolved to the component.
 *
 * Looked up rather than imported one by one: the set lives in a table an
 * administrator edits, so the code cannot know it at build time. An unknown or
 * missing name falls back to a tag rather than rendering nothing — a strip with
 * a hole in it reads as a broken row, not as a category without an icon.
 *
 * `isAll` is the strip's own leading item — "Everything", which is not a row
 * in that table and has no icon name to look up.
 */
export function iconComponent(name: string | null, isAll: boolean) {
  if (isAll) return Compass;
  if (!name) return Tag;
  return icons[name as keyof typeof icons] ?? Tag;
}

/**
 * The categories, as one scrolling row of chips under the search bar.
 *
 * Navigation between whole result sets rather than one control among several
 * inside the results: the facets narrow a list, this changes which list. What
 * says so is the position — first thing under the search, above the heading —
 * not a vocabulary of its own. The row used to be icon-over-label items with
 * a 2px underline on the chosen one, which is a tab bar, and a tab bar was a
 * fifth shape on a page that already had chips, pills, a dropdown and a
 * search; reviewed on dev it read as a strip borrowed from another product.
 * Chips in the filter pills' style say the same thing in the site's own
 * words — see `categoryItemClass`.
 *
 * It scrolls sideways rather than wrapping: a row that grows to two lines
 * pushes the results down by a different amount at every screen width, and the
 * categories past the fold are the rarer ones.
 *
 * No band and no hairline of its own. The chips carry their own borders and
 * their own height, so there is nothing left for a ground or a rule to
 * separate — and a hairline here would draw a second line a few pixels under
 * the header's own. All this element contributes is the space above it and
 * the positioning the fades and arrows are measured against.
 *
 * The fades and the arrows are the difference between a scroll container and a
 * finished one: without them the row simply ends mid-item, which reads as a
 * clipping bug rather than as more content.
 */
export function CategoryStrip({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (by: number) => scroller.current?.scrollBy({ left: by, behavior: "smooth" });

  return (
    <nav aria-label={label} className="relative mt-4">
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
          row's padding is symmetric (see the scroller below), so the layer
          can simply fill the nav to stay centred on the chips — a 36px chip
          row inside 4px of padding each side, which puts `top-1/2` on the
          chips' own centre line and the arrows level with them. */}
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

          `py-1` is the whole of the row's padding, and it is symmetric: a
          chip is a closed shape 36px tall that carries its own height and its
          own border (see `categoryItemClass`), so all the scroller owes it is
          a little room for the focus ring. The space that separates this row
          from the search above it is the nav's own `mt-4`, not padding here.

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
        className="page-shell flex gap-2 overflow-x-auto py-1 sm:px-14 lg:justify-center-safe [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
 * One category chip: a small icon beside its name, in the filter pills' own
 * shape — 36px tall, hairline border, navy fill when it is the one in force.
 *
 * The same vocabulary as `quickChipClass` and `FilterPill` on purpose. These
 * are all rows of choices over a list, and drawing this one as an
 * icon-over-label tab bar made the browse pages look assembled from two
 * different products.
 *
 * The chosen state changes the colours only — never the height, the border
 * width, the padding, the gap or the weight. A chip that grows shifts every
 * chip after it, and the whole row jumps sideways as the selection moves;
 * bold glyphs are wider than medium ones in every non-monospace face, so
 * `font-semibold` on the chosen chip would be that same jump by another
 * route. The resting chip borders in `--color-border` rather than the quick
 * chips' `--color-border-strong`: this row is longer and sits higher up the
 * page, and twenty-four strong hairlines under the search read as a fence.
 */
export function categoryItemClass(active: boolean): string {
  const base =
    "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] font-medium transition-colors";
  return active
    ? `${base} border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] text-[var(--color-navy-on)]`
    : `${base} border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]`;
}
