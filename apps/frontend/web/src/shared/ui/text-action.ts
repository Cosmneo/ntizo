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
 * The underline is `text-decoration`, not a bottom border, and the difference
 * is visible rather than academic. A border belongs to the element's box, so
 * on `Editar perfil` — the one action here that carries an icon — it ran the
 * full width of the flex row, under the pencil and the gap beside it, and
 * `rounded-[var(--radius-field)]` below curled its two ends upward. The result
 * read as the bottom edge of a box someone forgot to finish, not as a link.
 * `text-decoration` is drawn from the text's own baseline: it hugs the words,
 * skips the icon because an SVG is an atomic inline the decoration does not
 * propagate into, and has no corners to round. `underline-offset` gives the
 * clearance the old `pb-0.5` was buying.
 *
 * `destructive` swaps the colour for the one thing on a row that removes it.
 */
export function textAction(opts: { destructive?: boolean } = {}): string {
  return cn(
    "type-body-medium inline-flex items-center gap-1.5 font-semibold transition-colors",
    "hover:underline underline-offset-[5px] decoration-1",
    opts.destructive
      ? "text-[var(--color-destructive)]"
      : "text-[var(--color-headline)]",
    // The same ring the button primitive uses. Without it these actions fall
    // back to the browser's own focus outline, which is a different shape on
    // every platform and does not match anything else on the page.
    "rounded-[var(--radius-field)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
    "disabled:cursor-default disabled:opacity-60 disabled:hover:no-underline",
  );
}
