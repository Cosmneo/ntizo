import { cn } from "@ntizo/frontend-ui";

/**
 * A text action: the words in the headline colour, an underline that appears
 * on hover, no box.
 *
 * The secondary action on a borderless page. An outlined button beside a
 * heading competes with it, and one per row turns a list into a form; the
 * words alone, in the colour the page already uses for what matters, say
 * "this does something" without saying "look at me". The one primary action
 * a page has — add an address, search — keeps the filled button.
 *
 * `destructive` swaps the colour for the one thing on a row that removes it.
 */
export function textAction(opts: { destructive?: boolean } = {}): string {
  return cn(
    "type-body-medium inline-flex items-center gap-1.5 border-b border-transparent pb-0.5 font-semibold transition-colors",
    opts.destructive
      ? "text-[var(--color-destructive)] hover:border-current"
      : "text-[var(--color-headline)] hover:border-current",
    // The same ring the button primitive uses. Without it these actions fall
    // back to the browser's own focus outline, which is a different shape on
    // every platform and does not match anything else on the page.
    "rounded-[var(--radius-field)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
    "disabled:cursor-default disabled:opacity-60 disabled:hover:border-transparent",
  );
}
