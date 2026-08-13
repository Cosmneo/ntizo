import type { ServiceBookingMode } from "@ntizo/shared";
import { serviceDraftErrors, type ServiceDraft } from "./service-draft";

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
  | "timing"
  | "pricing"
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
 * Late, and not by choice: `service.create` wants the category, name,
 * location, booking mode, performers *and* the timing grid in one call, so
 * the wizard cannot write a row until the step that collects the last of
 * them is done. Only options and translations come after — they are separate
 * mutations addressed by the id this step produces.
 *
 * The same trade the onboarding wizard makes at `CREATES_PROVIDER`: creating
 * earlier would leave a half-built row behind every abandoned attempt.
 */
export const CREATES_SERVICE: ServiceStep = "timing";

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

  steps.push("timing");

  if (input.bookingMode === "priced") steps.push("pricing");

  steps.push("languages", "review");

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
 * screen one must not report a fault on screen four. A provider who has typed
 * a name and picked a category should not be held there by a buffer they have
 * not been asked for yet.
 *
 * Only two steps have anything to refuse. `booking` always carries a real
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
  if (step === "timing") {
    // The same [0, 480] the server accepts, asked through the one function
    // that owns that range rather than repeating the bounds here.
    return serviceDraftErrors(draft).bufferMinutes !== undefined;
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
