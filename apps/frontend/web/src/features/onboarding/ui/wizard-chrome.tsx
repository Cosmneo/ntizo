import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import {
  isReachable,
  subProgress,
  type OnboardingPhase,
  type OnboardingScreen,
} from "@/features/onboarding/domain/screen-model";

const PHASES: OnboardingPhase[] = [1, 2, 3];

/**
 * The phase strip.
 *
 * Sticky, because it is the only thing telling someone how much is left, and a
 * wizard whose progress scrolls away feels longer than it is. Completed chips
 * are clickable and future ones are not — forward would skip the step that
 * creates the provider, so it is not a shortcut but a broken screen waiting.
 */
export function PhaseChips({
  current,
  onSeek,
  labels,
}: {
  current: OnboardingScreen;
  onSeek: (target: OnboardingScreen) => void;
  labels: Record<OnboardingPhase, string>;
}) {
  const sub = subProgress(current);

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-8 bg-[var(--color-background)]/92 px-4 py-3 backdrop-blur">
      <ol className="flex list-none gap-2 overflow-x-auto p-0">
        {PHASES.map((phase) => {
          const isCurrent = current.phase === phase;
          const isDone = current.phase > phase;
          const target: OnboardingScreen =
            phase === 1 ? { phase: 1, sub: "type" } : { phase };
          const reachable = isReachable(target, current);

          return (
            <li key={phase} aria-current={isCurrent ? "step" : undefined}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSeek(target)}
                className={cn(
                  "type-caption inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap transition-colors",
                  isCurrent && "bg-[var(--color-primary)] text-white",
                  isDone &&
                    "cursor-pointer bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]",
                  !isCurrent &&
                    !isDone &&
                    "cursor-default bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : null}
                {labels[phase]}
              </button>
            </li>
          );
        })}
      </ol>

      {sub ? (
        <p className="type-caption mt-2 text-[var(--color-muted-foreground)] tabular-nums">
          {sub.current} / {sub.total}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One screen's question.
 *
 * Big and alone at the top, because each screen asks one thing. The eyebrow
 * carries what section this is so the title does not have to repeat it.
 */
export function HeroQuestion({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8">
      <p className="type-caption font-bold tracking-[0.16em] text-[var(--color-primary)] uppercase">
        {eyebrow}
      </p>
      <h1 className="font-rounded mt-2 text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance">
        {title}
      </h1>
      {description ? (
        <p className="type-body mt-3 max-w-[54ch] text-[var(--color-muted-foreground)]">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/**
 * The bar under every screen.
 *
 * Back on the left and forward on the right, in the reading direction, and the
 * primary action never moves between screens — a Continue button that shifts
 * position makes a wizard feel like a series of unrelated pages.
 */
export function StepFooter({
  onBack,
  backLabel,
  children,
}: {
  onBack?: () => void;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-10 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-6">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      {children}
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
        <p className="type-caption text-[var(--color-muted-foreground)]">{hint}</p>
      ) : null}
      {children}
      {error ? (
        <p className="type-caption text-[var(--color-destructive)]">{error}</p>
      ) : null}
    </div>
  );
}
