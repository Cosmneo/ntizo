import { useId, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ntizo/frontend-ui";
import { closeOnChoice } from "@/shared/components/browse/facet-panel";

/**
 * The full-height sheet a phone's filters open into.
 *
 * The shell both `MobileFilterBar` and `MobileDirectoryFilterBar` build by
 * hand today: the `Sheet` primitive slid up from the bottom, named by its
 * heading. This is that shell, pulled out once so the page tasks compose the
 * groups a facet panel already knows how to draw around it instead of each
 * re-drawing the sheet, the header and the footer for itself.
 *
 * **The outcome button, not "Apply".** A button that says "Apply" makes a
 * reader tap it to find out what happened; one that says "Show 38 results"
 * tells them before they commit, and lets them go back and loosen a filter
 * instead of narrowing to nothing and only finding out after the tap.
 *
 * **Closes on a choice, not on any click inside it.** A sheet left open over
 * the results it just changed hides the answer to the question the reader
 * asked, so picking an option closes it — but a bare `onClick` on the wrapper
 * closed on *any* click inside it, including the one that puts the cursor in
 * the price range's "Min" box, so the one filter that has to be typed could
 * not be typed at all. `closeOnChoice` draws the line at a link or a submit;
 * see its own comment in `facet-panel.tsx`.
 */
export function FilterSheet({
  open,
  onOpenChange,
  title,
  clear,
  apply,
  onApply,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The page's own "clear all" control, or `null` when nothing is narrowing. */
  clear: ReactNode;
  /** What pressing the button will show, e.g. "Show 38 results". */
  apply: string;
  onApply: () => void;
  /** The facet groups, exactly as the sidebar draws them. */
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        labelledBy={titleId}
        className="flex max-h-[85svh] flex-col rounded-t-[var(--radius-card)] p-5"
      >
        {/* The `Sheet` primitive itself is now the dialog — `role="dialog"`,
            `aria-modal`, focus trap and Escape all live on `SheetContent`
            (see follow-up #78). This div is plain grouping, not a second
            landmark. */}
        <div className="flex-1 overflow-y-auto">
          <SheetHeader>
            <SheetTitle id={titleId}>{title}</SheetTitle>
          </SheetHeader>

          <div className="mt-4" onClick={closeOnChoice(() => onOpenChange(false))}>
            {children}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-[var(--color-border)] py-3.5 pb-6">
          {clear}
          <button
            type="button"
            onClick={onApply}
            className="rounded-[12px] bg-[var(--color-navy-surface)] px-5.5 py-3.5 text-[15px] font-bold text-[var(--color-navy-on)]"
          >
            {apply}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One headed group inside the sheet.
 *
 * A heading and its rows, not a `<details>`: the pills collapse because six
 * open groups do not fit on a toolbar, and the sheet is a screen with room
 * for all of them. Making the reader open each one here would be one tap per
 * filter for nothing.
 *
 * Here rather than in each page's filters, where both pages carried it
 * verbatim: it is the sheet's own furniture, it names nothing route-typed,
 * and two copies is how the two sheets come to head their groups differently.
 * `hint` stays — the services sheet gives the city and the language groups a
 * line the label alone would overclaim.
 */
export function SheetGroup({
  label,
  hint,
  children,
}: {
  label: string;
  /** A line under the heading, where the label alone would overclaim. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-border)] py-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-[0.05em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </h3>
      {hint && <p className="type-caption mt-2 text-[var(--color-muted-foreground)]">{hint}</p>}
      <div className="mt-3 grid">{children}</div>
    </section>
  );
}
