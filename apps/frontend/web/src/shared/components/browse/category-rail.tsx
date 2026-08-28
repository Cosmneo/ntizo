import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/** How far one press of an arrow moves the rail. */
const SCROLL_STEP = 320;

/**
 * The categories, as a band under the hero.
 *
 * Navigation between whole result sets — the same weight as the site header
 * above it — rather than one control among several inside the results. The
 * facets narrow a list; this changes which list.
 *
 * It scrolls sideways rather than wrapping: a band that grows to two rows
 * pushes the results down by a different amount at every screen width, and the
 * categories past the fold are the rarer ones.
 *
 * On the page's tinted ground, not on white. A white band made three white
 * surfaces stack — header, search card, rail — and the search card, which
 * overlaps this band's top edge, disappeared into it.
 *
 * The fades and the arrows are the difference between a scroll container and a
 * finished one: without them the row simply ends mid-chip, which reads as a
 * clipping bug rather than as more content.
 */
export function CategoryRail({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (by: number) => scroller.current?.scrollBy({ left: by, behavior: "smooth" });

  return (
    <nav
      aria-label={label}
      // Deliberately NOT positioned, even though everything inside it is. The
      // hero's search card hangs 16px onto this band and has to be drawn in
      // front of it — and a positioned element painted after the card wins on
      // tree order alone, whatever the card does short of taking a z-index of
      // its own, which it cannot (see `BrowseHero`). A static element paints
      // its background below every positioned one, so the band goes under the
      // card and the card's rounded bottom edge survives. The mockup's own
      // rail is built exactly this way.
      className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]"
    >
      {/* The positioned wrapper the fades and arrows are measured against.
          Transparent, so it can sit above the card without covering it. */}
      <div className="relative">
        {/* `page-shell` again, but positioned absolute-inset-0 over the band
            rather than laid out in flow: it borrows the row's own centred
            width so the fades and arrows land at the edge of the *chips*,
            not the edge of the *screen*. On a wide monitor those are two
            different lines, and an arrow sitting 12px from the browser chrome
            while the row it scrolls starts hundreds of pixels further in
            reads as a stray control, not as part of the rail.

            `pointer-events-none` on the box itself: unlike the individual
            corner-sized elements this used to hold directly, the box now
            spans the whole centred column, and a transparent layer that size
            sitting above the chips would eat every click on the row it is
            only meant to decorate. Each `RailArrow` opts back in for itself.

            Aligning the arrows to the chips' own edge cuts both ways: it also
            puts the arrows and the row's first/last chip on the exact same
            line, so without give somewhere the row can scroll a chip straight
            underneath one. That give isn't here — it can't be, this layer
            doesn't share flow with the row — it's the scroller's own padding
            below.

            `top-6 bottom-0`, not `inset-0`: the scroller below carries more
            padding above the chips than below (see `pt-10`/`pb-4` there), to
            open a gap under the hero's search card. `inset-0` would stretch
            this layer to that taller, asymmetric box and centre the arrows —
            and, through `Fade`'s own `inset-y-0`, the fades — on the *band*,
            which sits higher than the chip row now sits within it: the
            arrows would float above the chips. Insetting the top by the same
            24px the padding grew by (`pt-10` minus `pb-4`) shrinks this layer
            back to exactly the old symmetric box, so `top-1/2` below and
            `Fade`'s `inset-y-0` land on the chip row again, not the band. If
            the padding split above changes, this offset has to change with
            it — it is `pt - pb`, not a fixed 24px. */}
        <div className="page-shell pointer-events-none absolute inset-x-0 top-6 bottom-0">
          <Fade side="left" />
          <Fade side="right" />

          <RailArrow side="left" onClick={() => nudge(-SCROLL_STEP)} />
          <RailArrow side="right" onClick={() => nudge(SCROLL_STEP)} />
        </div>

        {/* `sm:px-14`: clears the arrows above (36px wide, inset 12px, so
            they end 48px in from this same edge) by the same 56px the fade
            already uses, so a chip can't land under either arrow, at rest or
            scrolled to either end. `sm`-only because that's the only range
            with arrows to clear — below it there's nothing to give way to, so
            the row stays flush with the content column, exactly as on a
            phone. Don't trim this as a duplicate of the arrows' own inset:
            it's a different box (the row, not the absolutely-positioned
            layer above) solving a different problem (the row's *content*
            sitting under an arrow, not the arrow's own position).

            `pt-10`, not the `pb-4` it used to match: the hero's search card
            straddles this band by design (see `BrowseHero`) and, with a
            symmetric `py-4`, its bottom edge landed within a pixel of the
            chip row's top edge — the two read as one crowded block. Padding
            only the top opens a clear gap under the card without pushing the
            chips' own bottom spacing along with it. `pb-4` is what `py-4`
            used to give both sides, kept as-is. The wrapper above compensates
            so the arrows and fades keep tracking the chip row, not this now
            taller, asymmetric box.

            `lg:justify-center-safe`, not `lg:justify-center`: the hero above
            (title, subtitle, search card) is centred from `lg` up, and a
            short category list should sit under it the same way instead of
            hugging the left edge with empty space to its right. Plain
            `justify-center` on a *scrolling* flex container is a standing
            browser bug, not a style choice — once the chips overflow, the
            portion that overflows to the left is pushed before the
            container's own scroll start, and nothing can scroll back far
            enough to reach it, so the first categories become permanently
            unreachable the moment the catalogue outgrows the dev seed data.
            `-safe` centres only while every chip already fits and falls back
            to start alignment the instant it doesn't, which is centred *and*
            keeps the whole row reachable — do not "simplify" this back to
            `justify-center`, it only looks equivalent with a handful of
            categories. Below `lg` the row stays start-aligned, unchanged: on
            a phone the first chip should sit flush with the content column,
            where the eye already is. */}
        <div
          ref={scroller}
          data-testid="rail-scroller"
          className="page-shell flex gap-2 overflow-x-auto pt-10 pb-4 sm:px-14 lg:justify-center-safe [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
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
          ? "left-0 bg-gradient-to-r from-[var(--color-surface-raised)] to-transparent"
          : "right-0 bg-gradient-to-l from-[var(--color-surface-raised)] to-transparent",
      )}
    />
  );
}

/**
 * Hidden from assistive technology and out of the tab order on purpose.
 *
 * A keyboard reader reaches every chip by tabbing, and the container scrolls to
 * follow focus; two extra stops that scroll a list they are already walking add
 * nothing. This is a mouse affordance and only a mouse affordance — which is
 * also why it is drawn only from `sm` up.
 */
function RailArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      data-testid={`rail-arrow-${side}`}
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
 * One category chip.
 *
 * The chosen state changes colour only — never the border width, never the
 * padding. A selected chip that grows shifts every chip after it, and the whole
 * row jumps sideways as the selection moves.
 */
export function categoryChipClass(active: boolean): string {
  const base =
    "type-body-medium shrink-0 whitespace-nowrap rounded-full border px-4 py-2 transition-colors";
  return active
    ? `${base} border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_9%,transparent)] font-semibold text-[var(--color-primary)]`
    : `${base} border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:border-[var(--color-muted-foreground)]`;
}
