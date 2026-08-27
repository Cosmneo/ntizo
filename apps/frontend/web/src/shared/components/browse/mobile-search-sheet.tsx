import { useId, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ntizo/frontend-ui";
import { SEARCH_SUBMIT_CLASS } from "@/shared/components/browse/browse-hero";

/**
 * The hero's search, on a phone: one tappable row.
 *
 * Two fields and a button squeezed into 360px is a control nobody completes —
 * each field ends up too narrow to show what is in it, and the button wraps
 * onto a line of its own. So below `md` the whole card collapses to this: what
 * is being searched for, where, and a way in.
 *
 * `md:hidden` lives here rather than at the call site, and `hidden md:block`
 * lives on `BrowseSearchCard` for the same reason: the two are a pair, and one
 * of them is on screen at every width. Two call sites each remembering half of
 * that is how both end up on screen at once on one of the two pages.
 *
 * The accessible name is exactly what is drawn — the label, then the value —
 * rather than a separate "Search" nobody can see. A button that announces one
 * thing and shows another is two different controls to two different readers.
 */
export function MobileSearchTrigger({
  label,
  value,
  onOpen,
}: {
  /** What is being looked for, or the prompt when nothing is yet. */
  label: string;
  /** Where — the chosen city, or "Anywhere". */
  value: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-3.5 text-left shadow-[var(--shadow-float)] md:hidden"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--color-muted)] text-[var(--color-primary)]">
        <Search className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="grid min-w-0">
        <b className="type-body-medium truncate font-semibold">{label}</b>
        <span className="type-caption truncate text-[var(--color-muted-foreground)]">{value}</span>
      </span>
      <span
        aria-hidden="true"
        className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
      >
        <Search className="h-[15px] w-[15px]" />
      </span>
    </button>
  );
}

/**
 * What the trigger opens: both fields, full width, and one button that applies
 * them.
 *
 * A `role="dialog"` of its own rather than the `Sheet` primitive's bare panel —
 * that primitive draws a fixed div and nothing else, so without this a screen
 * reader is handed two fields with no boundary and no name saying what they
 * are for.
 *
 * **Applying closes it.** A sheet left open over the results it just changed
 * hides the answer to the question the reader asked — the same rule the filter
 * bars follow. That belongs here rather than in each page's handler: two pages
 * each remembering to close is one page that forgets.
 *
 * Not `role="search"`: the hero's own card already carries that landmark, and
 * a second one — invisible at this width and identical in purpose — would give
 * a landmark list two searches to choose between.
 */
export function MobileSearchSheet({
  open,
  onOpenChange,
  title,
  apply,
  onApply,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The label on the submit button: "Show results". */
  apply: string;
  /** Write the drafts to the URL. Closing is this component's own business. */
  onApply: () => void;
  /** The two fields, stacked. */
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85svh] overflow-y-auto rounded-t-[var(--radius-card)] p-5"
      >
        <div role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <SheetHeader>
            <SheetTitle id={titleId}>{title}</SheetTitle>
          </SheetHeader>

          {/* A real form with a real submit, so the on-screen keyboard offers
              "go" from the text field and Enter reaches the button — the same
              reason `BrowseSearchCard` is one. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onApply();
              onOpenChange(false);
            }}
            className="mt-4 grid gap-2.5"
          >
            {children}
            <button type="submit" className={`${SEARCH_SUBMIT_CLASS} mt-1 w-full px-4`}>
              {apply}
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The class each page puts on the two fields it stacks inside the sheet. */
export const MOBILE_SEARCH_FIELD_CLASS =
  "type-body w-full min-w-0 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 outline-none focus:border-[var(--color-primary)]";
