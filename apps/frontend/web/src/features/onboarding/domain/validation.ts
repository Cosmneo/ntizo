import type { ProviderDraft } from "./draft";
import type { ProviderSubStep } from "./screen-model";

export type FieldKey = "type" | "name" | "country" | "city" | "payout";

/** Which fields belong to which screen. One list, so nothing validates twice or not at all. */
const STEP_FIELDS: Record<ProviderSubStep, FieldKey[]> = {
  type: ["type"],
  identity: ["name"],
  location: ["country", "city"],
};

/**
 * One validator per field, each returning a translation key or null.
 *
 * No validator short-circuits the others: a step reports everything wrong with
 * it at once. Fixing one error only to be shown the next is the interaction
 * that makes people abandon forms.
 */
const VALIDATORS: Record<FieldKey, (d: ProviderDraft) => string | null> = {
  type: (d) => (d.type ? null : "error.typeRequired"),
  name: (d) => (d.name.trim().length >= 2 ? null : "error.nameRequired"),
  country: (d) => (d.country.trim().length === 2 ? null : "error.countryRequired"),
  city: (d) => (d.city.trim() ? null : "error.cityRequired"),
  // Optional by design — a provider can be reviewed before they say how they
  // want to be paid, and blocking the application on it would lose people at
  // the last screen for a decision that can wait.
  payout: () => null,
};

export function validateStep(
  step: ProviderSubStep,
  draft: ProviderDraft,
): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  for (const field of STEP_FIELDS[step]) {
    const message = VALIDATORS[field](draft);
    if (message) errors[field] = message;
  }
  return errors;
}

/**
 * The first step that is not complete, or null when all of them are.
 *
 * The safety net for a restored draft: `sessionStorage` can hand back something
 * half-filled from a previous session, and landing on the last screen with an
 * empty first one would fail at submit with an error pointing three screens
 * back.
 */
export function firstIncompleteStep(draft: ProviderDraft): ProviderSubStep | null {
  for (const step of ["type", "identity", "location"] as const) {
    if (Object.keys(validateStep(step, draft)).length > 0) return step;
  }
  return null;
}
