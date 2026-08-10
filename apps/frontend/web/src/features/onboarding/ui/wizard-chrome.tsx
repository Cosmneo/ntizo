import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import {
  STEP_ORDER,
  isReachable,
  stepIndex,
  stepProgress,
  type WizardStep,
} from "@/features/onboarding/domain/screen-model";

/**
 * The step rail.
 *
 * Vertical, one row per screen, with a line running between the markers. A
 * horizontal chip strip came first and could not say what a rail says without
 * being read: how many steps there are, which one this is, and what the ones
 * after it will ask. On a wizard someone is deciding whether to finish, that is
 * the question the chrome exists to answer.
 *
 * Completed rows are clickable and later ones are not — forward would skip the
 * step that creates the provider.
 */
function StepRail({
  current,
  onSeek,
  labels,
  statusLabels,
}: {
  current: WizardStep;
  onSeek: (step: WizardStep) => void;
  labels: Record<WizardStep, string>;
  statusLabels: { done: string; active: string; stepPrefix: string };
}) {
  const currentIndex = stepIndex(current);

  return (
    <ol className="grid list-none gap-0 p-0">
      {STEP_ORDER.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const reachable = isReachable(step, current);
        const last = i === STEP_ORDER.length - 1;

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
export function WizardLayout({
  current,
  onSeek,
  labels,
  statusLabels,
  onBack,
  backLabel,
  footerNote,
  children,
}: {
  current: WizardStep;
  onSeek: (step: WizardStep) => void;
  labels: Record<WizardStep, string>;
  statusLabels: { done: string; active: string; stepPrefix: string };
  onBack?: () => void;
  backLabel: string;
  footerNote?: ReactNode;
  children: ReactNode;
}) {
  const { current: step, total } = stepProgress(current);

  return (
    /* Centred both ways. The documents step is twice the height of the first,
       so a card pinned to the top leaves the short screens floating in a page
       of empty grey; `place-items-center` keeps a tall one scrollable rather
       than clipped. */
    <div className="grid min-h-svh place-items-center bg-[var(--color-muted)] p-3 sm:p-6">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <aside className="hidden rounded-[var(--radius-card)] bg-[var(--color-background)] p-7 lg:flex lg:flex-col">
          <Link to="/" className="mb-9 block">
            <img
              src="/brand/logo-primary.svg"
              alt="Ntizo"
              className="h-7 w-auto"
            />
          </Link>

          <StepRail
            current={current}
            onSeek={onSeek}
            labels={labels}
            statusLabels={statusLabels}
          />

          {footerNote ? (
            <div className="type-caption mt-auto pt-8 text-[var(--color-muted-foreground)]">
              {footerNote}
            </div>
          ) : null}
        </aside>

        <main className="rounded-[var(--radius-card)] bg-[var(--color-background)] p-6 sm:p-10">
          {/* The phone's version of the rail: a bar, a count, and the way back.
              A six-row rail above a form on a 390px screen would push the first
              field below the fold. */}
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
                <img
                  src="/brand/logo-primary.svg"
                  alt="Ntizo"
                  className="h-6 w-auto"
                />
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

/** A labelled field with room for its error. */
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
    <div className="grid gap-1.5">
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
