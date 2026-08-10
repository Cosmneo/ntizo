/**
 * The wizard's steps, flat.
 *
 * It began as phases with sub-steps because the reference had them, and that
 * shape bought nothing here: every phase but the first had exactly one screen,
 * so the split existed to describe a nesting that was not there. A flat list is
 * also what the step rail can draw — one row per screen, which is the only
 * arrangement that lets someone see how much is left.
 */
export type WizardStep =
  | "type"
  | "identity"
  | "location"
  | "payout"
  | "documents"
  | "review";

export const STEP_ORDER: readonly WizardStep[] = [
  "type",
  "identity",
  "location",
  "payout",
  "documents",
  "review",
] as const;

export const FIRST_STEP: WizardStep = "type";

/** The step that creates the provider. Everything after it needs one to exist. */
export const CREATES_PROVIDER: WizardStep = "location";

export function stepIndex(step: WizardStep): number {
  return STEP_ORDER.indexOf(step);
}

export function nextStep(step: WizardStep): WizardStep | null {
  // The last one is terminal: what remains is done from the dashboard, not by
  // pushing the wizard further.
  return STEP_ORDER[stepIndex(step) + 1] ?? null;
}

export function previousStep(step: WizardStep): WizardStep | null {
  // No way back out of the last screen — the provider exists by then, and
  // re-running creation would make a second one.
  if (step === "review") return null;
  return STEP_ORDER[stepIndex(step) - 1] ?? null;
}

export function stepProgress(step: WizardStep): { current: number; total: number } {
  return { current: stepIndex(step) + 1, total: STEP_ORDER.length };
}

/**
 * Whether a rail row may be clicked from where the user is.
 *
 * Backwards only. Forward would skip the step that creates the provider, so it
 * is not a shortcut but a broken screen waiting to happen.
 */
export function isReachable(target: WizardStep, from: WizardStep): boolean {
  return stepIndex(target) <= stepIndex(from);
}
