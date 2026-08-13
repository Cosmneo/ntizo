import type { ServiceBookingMode } from "@ntizo/shared";
import type { ServiceDraft } from "./service-draft";

/**
 * The service wizard's steps, flat — one per screen, the shape the step rail
 * can draw.
 *
 * Two of them are the old `PricingSection` pulled apart. It asked how the
 * service charges and what it charges on one screen, and gated the second
 * half behind a `showOptionsEditor` flag, because options are a mutation
 * addressed by service id and there is no id until the first save. Here the
 * order of the steps says that instead: `booking` asks the mode before the
 * service exists, `pricing` collects the amounts after it does.
 */
export type ServiceStep =
  | "basics"
  | "booking"
  | "performers"
  | "pricing"
  | "images"
  | "languages"
  | "review";

/** What decides which steps a given service is actually asked. */
export interface ShapeInput {
  /** One member means the performers question has one answer and is not asked. */
  individualProvider: boolean;
  bookingMode: ServiceBookingMode;
}

export const FIRST_STEP: ServiceStep = "basics";

/**
 * The step that creates the service.
 *
 * `booking`, because it is the last step that exists in *every* shape before
 * `pricing` — `performers` is dropped for an individual provider, so it cannot
 * be relied on. It moved here from `timing` when the buffer and the grid left
 * the service for the availability rule that owns them.
 *
 * The same trade the onboarding wizard makes at `CREATES_PROVIDER`: creating
 * earlier would leave a half-built row behind every abandoned attempt.
 */
export const CREATES_SERVICE: ServiceStep = "booking";

/**
 * The steps this service is asked, in order.
 *
 * Two are dropped rather than shown-and-skipped. `performers` because the
 * server seeds an individual provider's one member on create, so the question
 * has a single answer — the rule `sectionStates` in `completeness.ts` already
 * applies. `pricing` because the server refuses options on a quote service
 * (`SERVICE_QUOTE_HAS_OPTIONS`), so a screen collecting them could only
 * produce a service that will not publish.
 */
export function stepsFor(input: ShapeInput): readonly ServiceStep[] {
  const steps: ServiceStep[] = ["basics", "booking"];

  if (!input.individualProvider) steps.push("performers");

  if (input.bookingMode === "priced") steps.push("pricing");

  // Unconditional: a quote service has no options but still has photographs.
  // The two are unrelated questions and only one of them is about money.
  // After `CREATES_SERVICE` because `service.create` carries no image keys —
  // only `service.update` does.
  steps.push("images", "languages", "review");

  return steps;
}

export function nextStep(
  step: ServiceStep,
  steps: readonly ServiceStep[],
): ServiceStep | null {
  const i = steps.indexOf(step);
  // The last one is terminal: what remains is done from the services list,
  // not by pushing the wizard further.
  return i === -1 ? null : (steps[i + 1] ?? null);
}

export function previousStep(
  step: ServiceStep,
  steps: readonly ServiceStep[],
): ServiceStep | null {
  const i = steps.indexOf(step);
  return i <= 0 ? null : (steps[i - 1] ?? null);
}

/**
 * Whether a rail row may be clicked from where the provider is.
 *
 * Saved services are freely navigable — someone changing one price should not
 * have to walk five screens to reach it, and every step's data already exists
 * server-side. An unsaved one may only go back, because forward would skip
 * `CREATES_SERVICE` and land on a screen whose mutations need an id that is
 * not there yet.
 */
export function isReachable(
  target: ServiceStep,
  from: ServiceStep,
  { saved }: { saved: boolean },
  steps: readonly ServiceStep[],
): boolean {
  const targetIndex = steps.indexOf(target);
  // A step this shape does not ask is not reachable by any route, saved or
  // not — `indexOf` returning -1 would otherwise read as "before everything".
  if (targetIndex === -1) return false;
  if (saved) return true;
  return targetIndex <= steps.indexOf(from);
}

/**
 * Whether this step's own answers are not yet fit to move on from.
 *
 * Per step, deliberately, and not "is the whole draft valid": Continue on
 * screen one must not report a fault on a later screen, whatever the shape
 * happens to be asking there.
 *
 * Only `basics` has anything to refuse. `booking` always carries a real
 * mode; `performers` may legitimately be empty on a draft (only a *published*
 * organization service needs one, which `serviceDraftErrors` checks with its
 * own context and `publishBlocker` reports on the review screen); `pricing`,
 * `languages` and `review` write through their own mutations rather than
 * through the draft this reads.
 */
export function stepBlocks(step: ServiceStep, draft: ServiceDraft): boolean {
  if (step === "basics") {
    return (
      draft.categoryId.trim().length === 0 ||
      draft.name.trim().length === 0 ||
      draft.locationType === ""
    );
  }
  return false;
}

/** Counts against this shape's own length — never the widest one. */
export function stepProgress(
  step: ServiceStep,
  steps: readonly ServiceStep[],
): { current: number; total: number } {
  return { current: steps.indexOf(step) + 1, total: steps.length };
}
