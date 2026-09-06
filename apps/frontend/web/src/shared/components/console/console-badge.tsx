/**
 * The one badge: a count beside a nav label, in every rendering of the menu
 * — sidebar, tab bar, sheet. One class, so a count cannot be blue in one
 * place and red in another. Position and the collapsed-rail dot are the
 * caller's modifiers; the badge itself is this.
 */
export const CONSOLE_BADGE =
  "grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[10px] font-bold leading-none text-[var(--color-primary-foreground)] tabular-nums";
