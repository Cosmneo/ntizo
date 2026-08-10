import { cn } from "@ntizo/frontend-ui";

/**
 * The settings page's containers, shared by the real page and its skeleton.
 *
 * Shared rather than copied, and that is the whole point: a skeleton whose
 * card padding, icon tile or grid gutter is written out a second time drifts
 * the first time either side is touched, and the drift shows up as the page
 * jumping when the data lands. Here there is one definition of every box, so
 * the loading state cannot be a different size from the thing it stands in for.
 *
 * `title` and `blurb` are ReactNode, not string, so the skeleton can put grey
 * blocks exactly where the words go.
 */

/** The page grid: rail, then content. Same column widths in both states. */
export function SettingsLayout({
  nav,
  children,
}: {
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-10">
      {nav}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The read-only facts strip above the form. */
export function SettingsSnapshot({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      {children}
    </section>
  );
}

export function Section({
  id,
  icon,
  title,
  blurb,
  tone,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  blurb: React.ReactNode;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // Anchored links land under the sticky page header without this.
      className={cn(
        "mt-5 scroll-mt-6 rounded-[var(--radius-card)] border p-6",
        tone === "danger"
          ? "border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_4%,transparent)]"
          : "border-[var(--color-border)]",
      )}
    >
      <div className="mb-6 flex items-start gap-3.5">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-card-sm)]",
            tone === "danger"
              ? "bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)]"
              : "bg-[var(--color-muted)] text-[var(--color-primary)]",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="type-h3 font-semibold">{title}</h2>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** The bar at the foot of the content column. See `settings.tsx` for why sticky. */
export function SettingsSaveBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky -bottom-6 z-20 -mx-6 -mb-6 mt-6 border-t border-[var(--color-border)] bg-[var(--color-background)]/95 px-6 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        {children}
      </div>
    </div>
  );
}
