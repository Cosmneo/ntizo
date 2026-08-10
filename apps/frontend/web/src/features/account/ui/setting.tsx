import type { ReactNode } from "react";

/**
 * One setting: what it is, what it currently says, and the control to change it.
 *
 * Stacked rather than tabbed. Tabs hide settings behind a click and make the
 * page a place you navigate; a settings page is a place you scan. The current
 * value repeats on the right of the heading so the whole page can be read
 * without opening a single control — which is what someone checking their
 * setup is actually doing.
 */
export function Setting({
  title,
  blurb,
  value,
  label,
  children,
}: {
  title: string;
  blurb: string;
  /** The current answer, in words. Omitted when the control is not a single value. */
  value?: string;
  /** The small caps label directly above the control. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-border)] py-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="type-h3 font-semibold">{title}</h2>
        {value ? (
          <span className="type-body-medium font-semibold text-[var(--color-muted-foreground)]">
            {value}
          </span>
        ) : null}
      </div>
      <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
        {blurb}
      </p>

      <div className="mt-4">
        {label ? (
          <p className="type-caption mb-1.5 font-semibold tracking-wide text-[var(--color-muted-foreground)] uppercase">
            {label}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}
