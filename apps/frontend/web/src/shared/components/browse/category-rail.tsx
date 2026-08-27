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
      className="relative border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]"
    >
      <Fade side="left" />
      <Fade side="right" />

      <RailArrow side="left" onClick={() => nudge(-SCROLL_STEP)} />
      <RailArrow side="right" onClick={() => nudge(SCROLL_STEP)} />

      <div
        ref={scroller}
        data-testid="rail-scroller"
        className="page-shell flex gap-2 overflow-x-auto py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        "absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full sm:grid",
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
