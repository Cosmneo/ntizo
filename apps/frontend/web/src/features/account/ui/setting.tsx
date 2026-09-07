import type { ReactNode } from "react";

/**
 * One setting: what it is, one line on what it affects, and the control.
 *
 * Stacked rather than tabbed. Tabs hide settings behind a click and make the
 * page a place you navigate; a settings page is a place you scan.
 *
 * The control carries the current value itself, so nothing repeats it beside
 * the heading — the page used to print "Português (Portugal)" twice within
 * three lines — and there is no tracked-out label above the control either:
 * the heading two lines up already names it, and the control's own
 * accessible name is what a screen reader hears.
 */
export function Setting({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-border)] py-6 first:border-t-0 first:pt-0">
      <h2 className="type-h3 font-semibold text-[var(--color-headline)]">{title}</h2>
      <p className="type-body mt-1 text-[var(--color-muted-foreground)]">{blurb}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
