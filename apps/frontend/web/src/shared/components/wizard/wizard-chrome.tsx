import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";

/**
 * The wizard chrome, for any wizard.
 *
 * It began life in `features/onboarding/ui/`, reading `STEP_ORDER` and
 * `isReachable` from that feature's `screen-model` at the module level. That
 * was fine while there was one wizard and fatal the moment there were two:
 * the rail could only ever draw the onboarding steps, and the service wizard
 * needs a step list that changes shape per service.
 *
 * So the step list and the reachability rule arrive as props. Nothing here
 * decides anything — callers own their order, their labels and their rule
 * about which rows may be clicked. The pixels are unchanged from the version
 * onboarding shipped.
 */

/** How the layout claims space. */
export type WizardFrame =
  /** Its own page: fills the viewport. What onboarding uses, outside any shell. */
  | "screen"
  /** Inside a shell whose `main` already owns the viewport and its scrolling. */
  | "inset";

export interface WizardStatusLabels {
  done: string;
  active: string;
  stepPrefix: string;
}

/**
 * The step rail.
 *
 * Vertical, one row per screen, with a line running between the markers. A
 * horizontal chip strip came first and could not say what a rail says without
 * being read: how many steps there are, which one this is, and what the ones
 * after it will ask. On a wizard someone is deciding whether to finish, that is
 * the question the chrome exists to answer.
 */
function StepRail<S extends string>({
  steps,
  current,
  onSeek,
  labels,
  statusLabels,
  isReachable,
}: {
  steps: readonly S[];
  current: S;
  onSeek: (step: S) => void;
  labels: Record<string, string>;
  statusLabels: WizardStatusLabels;
  isReachable: (target: S, from: S) => boolean;
}) {
  const currentIndex = steps.indexOf(current);

  return (
    <ol className="grid list-none gap-0 p-0">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const reachable = isReachable(step, current);
        const last = i === steps.length - 1;

        return (
          <li
            key={step}
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3.5"
          >
            <div className="grid justify-items-center">
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full border-2 text-[13px] font-bold tabular-nums transition-colors",
                  done &&
                    "border-[var(--color-primary)] bg-[var(--color-primary)] text-white",
                  active &&
                    "border-[var(--color-primary)] text-[var(--color-primary)]",
                  !done &&
                    !active &&
                    "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              {/* The connector belongs to the row above it, so the last row
                  does not draw a line into empty space. */}
              {!last ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "my-1 w-0.5 flex-1 rounded-full",
                    done
                      ? "bg-[var(--color-primary)]"
                      : "bg-[var(--color-border)]",
                  )}
                  style={{ minHeight: 28 }}
                />
              ) : null}
            </div>

            <div className={cn("pb-7", last && "pb-0")}>
              <button
                type="button"
                disabled={!reachable}
                // The rail is a list of destinations and one of them is where
                // you are. Sighted readers get that from the filled marker;
                // without this a screen reader hears interchangeable buttons.
                {...(active ? { "aria-current": "step" as const } : {})}
                onClick={() => reachable && onSeek(step)}
                className={cn(
                  "block text-left",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span className="type-caption block text-[var(--color-muted-foreground)]">
                  {statusLabels.stepPrefix} {i + 1}
                </span>
                <span
                  className={cn(
                    "type-body-medium block font-semibold",
                    !done && !active && "text-[var(--color-muted-foreground)]",
                  )}
                >
                  {labels[step]}
                </span>
                {done || active ? (
                  <span className="type-caption block font-semibold text-[var(--color-primary)]">
                    {done ? statusLabels.done : statusLabels.active}
                  </span>
                ) : null}
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The wizard's frame: the rail beside the content, and the brand above it.
 *
 * Two columns from `lg`, because the rail needs room to be read and the form
 * needs room to be filled. Below that the rail collapses to the bar and counter
 * the reference uses on a phone — the same information, in the only shape that
 * fits.
 */
export function WizardLayout<S extends string>({
  steps,
  current,
  onSeek,
  labels,
  statusLabels,
  isReachable,
  onBack,
  backLabel,
  brand,
  footerNote,
  frame = "screen",
  children,
}: {
  steps: readonly S[];
  current: S;
  onSeek: (step: S) => void;
  labels: Record<string, string>;
  statusLabels: WizardStatusLabels;
  isReachable: (target: S, from: S) => boolean;
  onBack?: () => void;
  backLabel: string;
  /** Whatever sits above the rail — a logo on its own page, a way back inside a shell. */
  brand?: ReactNode;
  footerNote?: ReactNode;
  frame?: WizardFrame;
  children: ReactNode;
}) {
  const step = steps.indexOf(current) + 1;
  const total = steps.length;

  return (
    /* Centred both ways. The tallest step is roughly twice the height of the
       first, so a card pinned to the top leaves the short screens floating in a
       page of empty grey; `place-items-center` keeps a tall one scrollable
       rather than clipped.

       `inset` drops the viewport claim and bleeds the grey out to the edges of
       the shell's `main`, whose padding it then puts back. A second `min-h-svh`
       inside a `main` that already fills the viewport would push the wizard's
       own footer below the fold on every screen. */
    <div
      className={cn(
        "grid place-items-center bg-[var(--color-muted)]",
        frame === "screen"
          ? "min-h-svh p-3 sm:p-6"
          : "-m-4 min-h-full p-4 sm:-m-6 sm:p-6",
      )}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <aside className="hidden rounded-[var(--radius-card)] bg-[var(--color-background)] p-7 lg:flex lg:flex-col">
          {brand ? <div className="mb-9">{brand}</div> : null}

          <StepRail
            steps={steps}
            current={current}
            onSeek={onSeek}
            labels={labels}
            statusLabels={statusLabels}
            isReachable={isReachable}
          />

          {footerNote ? (
            <div className="type-caption mt-auto pt-8 text-[var(--color-muted-foreground)]">
              {footerNote}
            </div>
          ) : null}
        </aside>

        <main className="rounded-[var(--radius-card)] bg-[var(--color-background)] p-6 sm:p-10">
          {/* The phone's version of the rail: a bar, a count, and the way back.
              A seven-row rail above a form on a 390px screen would push the
              first field below the fold. */}
          <div className="mb-8 lg:hidden">
            <div className="flex items-center justify-between gap-4">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="type-body-medium inline-flex items-center gap-1.5 font-semibold"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {backLabel}
                </button>
              ) : (
                (brand ?? <span />)
              )}
              <span className="type-caption rounded-full bg-[var(--color-muted)] px-3 py-1 font-semibold tabular-nums">
                {statusLabels.stepPrefix} {step}/{total}
              </span>
            </div>
            <div className="mt-4 h-1 rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300"
                style={{ width: `${(step / total) * 100}%` }}
              />
            </div>
          </div>

          <div className="mx-auto max-w-xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * One screen's question.
 *
 * Centred, unlike the rest of the app's headings, because the form under it is
 * centred and a left-aligned title over a centred column reads as a mistake.
 */
export function HeroQuestion({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8 text-center">
      <h1 className="font-rounded text-[clamp(1.5rem,3vw,2.1rem)] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
        {title}
      </h1>
      {description ? (
        <p className="type-body mx-auto mt-3 max-w-[46ch] text-[var(--color-muted-foreground)]">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/**
 * The actions under every screen.
 *
 * The primary is full width and last, which is where a thumb reaches on a phone
 * and where the eye lands after the final field.
 */
export function StepFooter({
  onBack,
  backLabel,
  secondary,
  children,
}: {
  onBack?: () => void;
  backLabel: string;
  secondary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-9 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="hidden sm:inline-flex"
          >
            {backLabel}
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <div className="grid gap-3 sm:flex sm:justify-end sm:gap-3">
          {secondary}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A labelled field with room for its error.
 *
 * `content-start`, because a field shares its grid row with whatever sits
 * beside it. A grid child is stretched to the row's height, and this inner
 * grid then spread its own rows into that height — so a field next to a
 * taller one (a neighbour with a hint, or an error under it) drew its box a
 * line below its label. Packed to the top, label and box stay together and
 * the spare height is left empty underneath, where nobody reads it.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={htmlFor} className="type-body-medium font-semibold">
        {label}
      </label>
      {hint ? (
        <p className="type-caption text-[var(--color-muted-foreground)]">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className="type-caption text-[var(--color-destructive)]">{error}</p>
      ) : null}
    </div>
  );
}
