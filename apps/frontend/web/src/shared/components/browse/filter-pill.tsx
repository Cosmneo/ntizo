import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * One group of filters, as a pill that opens a small panel.
 *
 * **A `<details>`, not a menu.** `FacetGroup` already proved the pattern in
 * this codebase: it opens and closes with no script, it is keyboard-operable
 * and announced correctly without a line of ARIA, and it survives the
 * server-rendered first paint — which matters on a page built to be crawled,
 * where the filters are links a crawler should be able to follow.
 *
 * The options inside stay route-typed `<Link>`s owned by the page, so a
 * filtered list is still a URL somebody can send and the back button still
 * undoes it.
 */
export function FilterPill({
  label,
  active,
  clear,
  children,
}: {
  label: string;
  /** The chosen option's label. Present means applied, and the pill fills. */
  active?: string | undefined;
  /** The page's own `<Link>` back to this URL without this parameter. */
  clear?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Progressive enhancement, both of them: without JavaScript the panel still
  // opens and still closes on its own summary, which is the floor. With it,
  // Escape and a click outside behave the way every other popover on the web
  // does.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current?.removeAttribute("open");
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const on = active != null;
  return (
    <div className="relative inline-flex">
      <details ref={ref}>
        <summary
          className={[
            "flex h-[38px] cursor-pointer list-none items-center gap-[7px] rounded-full border px-3.5 text-[13.5px] transition-colors [&::-webkit-details-marker]:hidden",
            on
              ? "border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] font-semibold text-[var(--color-navy-on)]"
              : "border-[var(--color-border-strong)] bg-[var(--color-background)] font-medium text-[var(--color-foreground)] hover:border-[var(--color-headline)]",
            clear ? "pr-9" : "",
          ].join(" ")}
        >
          {active ?? label}
          {!on && <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
        </summary>
        <div className="absolute top-[calc(100%+6px)] left-0 z-20 grid min-w-56 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 shadow-[var(--shadow-float)]">
          {children}
        </div>
      </details>
      {/* Outside the summary on purpose: a link inside it both navigates and
          toggles the disclosure, and which of the two wins is a browser
          detail rather than a decision. */}
      {clear && <span className="absolute top-1/2 right-2.5 -translate-y-1/2">{clear}</span>}
    </div>
  );
}

/**
 * The row the pills sit in, above the results and under the heading.
 *
 * **The desktop's only.** A toolbar of six popovers does not fit a thumb: below
 * `lg` it would wrap onto three rows of small targets between the reader and
 * the first result, and the phone already carries these same filters twice
 * over — as the quick chips above the results and as the stacked groups inside
 * the sheet the floating control opens. Three surfaces for one job is two too
 * many, so this one draws at exactly the width the other two hide at.
 *
 * The pills stay in the document either way, which is deliberate: they are
 * `<Link>`s a crawler should follow, and hiding them in CSS keeps them
 * followable while taking them off the phone's screen.
 *
 * **It wraps; there is no "More filters" pill.** The spec sketched one
 * collecting whatever did not fit at the current width, and R30 ruled the wrap
 * in its place: six pills and "Clear all" fit at 1440 and take a second row
 * between `lg` and about 1180px, which is legible, while an overflow pill
 * would need a `ResizeObserver` to know what fits and would hide filters a
 * crawler should see. The `filterPillMore` key was deleted from all eight
 * locales with that ruling.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 hidden flex-wrap items-center gap-2 border-b border-[var(--color-border)] pt-1.5 pb-5 lg:flex">
      {children}
    </div>
  );
}
