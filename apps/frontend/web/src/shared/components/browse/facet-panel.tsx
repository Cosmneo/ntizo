import { ChevronDown } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The browse sidebar.
 *
 * No card around it, unlike the tinted `FilterPanelCard` it replaces. That one
 * existed because the filters floated on a white page with nothing to sit on;
 * now the whole page is tinted and the results beside it are white cards, so a
 * second tinted panel would be a surface competing with the hero above it. The
 * sidebar is background, the results are content, and that is the hierarchy.
 */
export function FacetPanel({
  title,
  clear,
  children,
}: {
  title: string;
  /** The page's own "clear all" `<Link>`. Absent when nothing is narrowing. */
  clear?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid">
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <h2 className="font-rounded text-base font-semibold">{title}</h2>
        {clear}
      </div>
      {children}
    </div>
  );
}

/**
 * One group of options.
 *
 * `<details>`, not React state. It opens and closes with no JavaScript, it is
 * keyboard-operable and announced correctly without a line of ARIA, and the
 * chevron turns on `[open]` in CSS — everything a hand-rolled disclosure would
 * have needed a hook, two handlers and an `aria-expanded` to get right, and
 * would have got wrong on the server-rendered first paint.
 *
 * Open by default: a panel that starts collapsed hides what the reader came to
 * use and turns one click into two for every filter on the page.
 */
export function FacetGroup({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** A line under the heading, where the label alone would overclaim. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details
      open
      className="group/facet border-t border-[var(--color-border)] py-4 first:border-t-0 first:pt-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold tracking-[0.05em] text-[var(--color-muted-foreground)] uppercase [&::-webkit-details-marker]:hidden">
        <Icon className="h-3.5 w-3.5" aria-hidden={true} />
        {label}
        <ChevronDown
          aria-hidden="true"
          className="ml-auto h-4 w-4 transition-transform group-open/facet:rotate-180"
        />
      </summary>
      {hint && (
        <p
          data-testid="facet-hint"
          className="type-caption mt-2 text-[var(--color-muted-foreground)]"
        >
          {hint}
        </p>
      )}
      <div className="mt-3 grid">{children}</div>
    </details>
  );
}

/**
 * One option row.
 *
 * A class rather than a component, for the same reason `LISTING_TITLE_LINK_CLASS`
 * is: the row is a route-typed `<Link>` owned by its page.
 *
 * The row stays a link and carries `aria-pressed`, so it announces as a toggle
 * button in a pressed or unpressed state. It is deliberately NOT given a
 * checkbox role: it navigates, a filtered list is a URL somebody can send, and
 * the back button undoes it — none of which a real checkbox does. The box
 * beside the label is a picture of that state and nothing more.
 */
export function facetOptionClass(active: boolean): string {
  const base =
    "type-body-medium flex items-center gap-3 py-1.5 text-[var(--color-foreground)] transition-colors";
  return active ? `${base} font-semibold` : `${base} hover:text-[var(--color-primary)]`;
}

/** The tick box. Hidden from assistive technology — the link's `aria-pressed` already says this. */
export function FacetBox({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-background)]",
      )}
    >
      {active && (
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none">
          <path
            d="m4 12 5.5 5.5L20 7"
            stroke="var(--color-primary-foreground)"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * How many results an option would leave.
 *
 * Optional throughout, and absent on most groups: only the city facets are
 * counted server-side today. A group without counts renders identically minus
 * this element, so adding counts later moves nothing.
 */
export function FacetCount({ value }: { value: number }) {
  return (
    <span className="type-caption ml-auto tabular-nums text-[var(--color-muted-foreground)]">
      {value}
    </span>
  );
}
