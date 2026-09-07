import type { MouseEvent } from "react";
import { cn } from "@ntizo/frontend-ui";

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
  // Headline navy under the cursor, not the brand blue: "blue once per page"
  // covers the states a reader reaches as well as the ones they arrive to,
  // and a row that turns blue on hover is the page's one accent moving down a
  // list of six groups.
  return active ? `${base} font-semibold` : `${base} hover:text-[var(--color-headline)]`;
}

/**
 * The tick box. Hidden from assistive technology — the link's `aria-pressed`
 * already says this.
 *
 * Filled headline navy, not the brand blue: blue appears once per browse page,
 * on the header's search button, and a checked box in every group of a filter
 * sheet is not once. Navy is what the rest of "this one is on" wears here —
 * the filled pill, the current page number, the floating control.
 */
export function FacetBox({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors",
        active
          ? "border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-background)]",
      )}
    >
      {active && (
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none">
          <path
            d="m4 12 5.5 5.5L20 7"
            stroke="var(--color-navy-on)"
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

/**
 * Closes the sheet a facet panel is sitting in, when the reader chose
 * something and only then.
 *
 * A sheet left open over the results it just changed hides the answer to the
 * question the reader asked, so both phone filter bars close on a choice. But
 * a bare `onClick` on the wrapper closed on *any* click inside it, including
 * the one that puts the cursor in the price range's "Min" box — so the one
 * filter in there that has to be typed could not be typed at all.
 *
 * A link or a submit is a choice. Anything else is somebody still deciding.
 */
export function closeOnChoice(close: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a, button[type='submit']")) close();
  };
}
