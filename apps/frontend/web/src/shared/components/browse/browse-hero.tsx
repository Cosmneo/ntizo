import type { ComponentType, FormEvent, ReactNode, Ref } from "react";

/**
 * The head of a browse page.
 *
 * The listings had none: `/services` went from the site header straight to a
 * category band, and `/providers` put an `h1` inside the content column beside
 * the filters. Neither page had a face, and neither said what it was for.
 *
 * **No `overflow: hidden`.** The halo below wants clipping and the search card
 * exists to escape the band — the first version of this clipped the card in
 * half, on the phone where it mattered most. The halo is therefore sized to sit
 * inside the hero rather than the hero clipping its children.
 */
export function BrowseHero({
  kicker,
  title,
  subtitle,
  search,
}: {
  kicker?: { badge: string; body: string };
  title: string;
  subtitle: string;
  /** A `BrowseSearchCard`. It straddles the hero's bottom edge onto the rail below. */
  search: ReactNode;
}) {
  return (
    <section className="relative bg-[var(--color-surface-raised)] pt-14">
      {/* Inside the hero, top-aligned — see the note above. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(58%_100%_at_50%_0%,color-mix(in_srgb,var(--color-primary)_16%,transparent)_0%,transparent_72%)]"
      />

      <div className="page-shell relative">
        <div className="mx-auto max-w-[44rem] text-center">
          {kicker && (
            <p
              data-testid="hero-kicker"
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-1.5 pr-4 pl-2 shadow-[var(--shadow-xs)]"
            >
              <b className="rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] text-[var(--color-primary)] uppercase">
                {kicker.badge}
              </b>
              <span className="type-caption text-[var(--color-muted-foreground)]">
                {kicker.body}
              </span>
            </p>
          )}

          <h1 className="type-display mx-auto max-w-[20ch]">{title}</h1>
          <p className="type-body mt-3 text-[var(--color-muted-foreground)]">{subtitle}</p>
        </div>

        {/* The negative margin plus the spacer below is what makes the card
            straddle the boundary onto the rail rather than float above it.

            `relative` and **no `z-index`**: a layer of its own would be a
            stacking context around everything the slot holds, and the sheet
            the phone's trigger opens is in there — trapped at `z-10`, it came
            up *under* the filter bar. What keeps the card in front of the rail
            instead is that the rail paints its band from a static element; see
            `CategoryRail`. */}
        <div className="relative mx-auto mt-8 -mb-[42px] max-w-[1000px]">{search}</div>
        <div className="h-[26px]" aria-hidden="true" />
      </div>
    </section>
  );
}

/**
 * The search card the hero carries.
 *
 * A `role="search"` form, not a row of buttons: it is the page's primary
 * control and a screen-reader user should be able to jump straight to it.
 *
 * A **real** form, submitted by a real submit button. The first version of this
 * took no `onSubmit`, which forced its one caller into a `type="button"` and a
 * hand-rolled Enter handler — and left the card the only control on a page of
 * links that did nothing at all before JavaScript ran. Enter inside a text
 * field is a browser behaviour, not a feature to reimplement.
 *
 * **Not drawn at all below `md`.** Two fields and a button squeezed into 360px
 * is a control nobody completes: each field ends up too narrow to show what is
 * in it. `MobileSearchTrigger` takes over there, and carries the matching
 * `md:hidden` — the two are a pair, and putting each half on the component
 * rather than at the call site is what stops one page drawing both at once.
 *
 * The grid still stacks to one column, which is what the sheet's own fields
 * inherit.
 */
export function BrowseSearchCard({
  action,
  onSubmit,
  children,
}: {
  /** The submit button — `type="submit"`, so Enter in any field reaches it. */
  action: ReactNode;
  /**
   * What submitting means. Optional only so the shell can be rendered in
   * isolation; a page that omits it is a search that does nothing.
   */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <form
      role="search"
      {...(onSubmit ? { onSubmit } : {})}
      className="hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-2 shadow-[var(--shadow-float)] md:block"
    >
      <div
        data-testid="search-grid"
        className="grid grid-cols-1 items-stretch gap-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        {children}
        {action}
      </div>
    </form>
  );
}

/**
 * One field of the search card.
 *
 * A button rather than an `<input>`: both fields open something — a suggestion
 * list, a city picker — and an input that does nothing until you click it
 * anyway is a text box that lies about being one.
 */
export function BrowseSearchField({
  icon: Icon,
  label,
  value,
  onClick,
  ref,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** What is chosen, or the placeholder when nothing is. */
  value: string;
  onClick?: () => void;
  /**
   * So the page can put focus back here after the control this opened has
   * gone. Without it, closing a field drops focus onto `<body>` and a keyboard
   * or screen-reader user is thrown to the top of the document — which is what
   * happened on every Enter in the first version.
   *
   * A plain prop, not `forwardRef`: React 19 passes `ref` through like any
   * other, and the wrapper exists only to be unwrapped again.
   */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      className="flex items-center gap-3 rounded-[var(--radius-card-sm)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-raised)] md:border-l md:border-[var(--color-border)] md:first:border-l-0"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-muted)] text-[var(--color-primary)]">
        <Icon className="h-4 w-4" aria-hidden={true} />
      </span>
      <span className="grid min-w-0">
        <b className="type-body-medium font-semibold">{label}</b>
        <span className="type-body-medium truncate text-[var(--color-muted-foreground)]">
          {value}
        </span>
      </span>
    </button>
  );
}

/** The search card's submit button. */
export const SEARCH_SUBMIT_CLASS =
  "font-rounded inline-flex items-center justify-center gap-2 rounded-[var(--radius-card-sm)] bg-[var(--color-primary)] px-10 py-3.5 text-[15px] font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-deep)]";
