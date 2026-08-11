import {
  DEFAULT_LOCALE,
  type Locale,
  type ServiceBookingMode,
  type ServiceLocationType,
  type ServicePricingMode,
} from "@ntizo/shared";
import type { ProviderService, ServiceOption } from "./types";

/**
 * The form's own copy of a service, before it exists on the server.
 *
 * `locationType` is `""` rather than one of the four real values while
 * unanswered — the interface asks "remotely or in person?" as a first
 * question and "in person" is not itself a storable value (it is the
 * umbrella over three of the four), so there is a real state in between
 * "unanswered" and any concrete choice.
 */
export interface ServiceDraft {
  categoryId: string;
  /** The language this service is written in. Fixed at creation; never edited afterwards. */
  sourceLocale: Locale;
  name: string;
  description: string;
  locationType: ServiceLocationType | "";
  bookingMode: ServiceBookingMode;
}

export function emptyDraft(): ServiceDraft {
  return {
    categoryId: "",
    sourceLocale: DEFAULT_LOCALE,
    name: "",
    description: "",
    locationType: "",
    bookingMode: "priced",
  };
}

/** Seeds the draft from a service already on the server, for editing. */
export function draftFrom(service: ProviderService): ServiceDraft {
  const source = service.translations.find((t) => t.locale === service.sourceLocale);
  return {
    categoryId: service.categoryId,
    sourceLocale: service.sourceLocale,
    name: source?.name ?? "",
    description: source?.description ?? "",
    locationType: service.locationType,
    bookingMode: service.bookingMode,
  };
}

/**
 * Whether the draft can be submitted.
 *
 * The same three rules the server enforces before it will publish, checked
 * here so the answer arrives before the round trip rather than as a red
 * message after it. `bookingMode` needs no check of its own — the draft
 * always carries a real value for it.
 */
export function canSubmit(draft: ServiceDraft): boolean {
  return (
    draft.categoryId.trim().length > 0 &&
    draft.name.trim().length > 0 &&
    draft.locationType !== ""
  );
}

/**
 * What the sheet may currently do, derived from a single signal: whether
 * this service has been saved.
 *
 * `serviceId` is that signal, and the *only* one — not the `editing` prop
 * the sheet was opened with. The sheet deliberately stays open after a
 * same-session create, so a service created in this visit has `serviceId`
 * set while `editing` is still whatever it was on open (usually `null`).
 * A version of this check that read `editing` instead once let someone
 * create a `quote` service, flip it to `priced` without closing the sheet,
 * and submit an option through the editor that had just appeared — the
 * server's own `SERVICE_QUOTE_HAS_OPTIONS` refusal is exactly the wasted
 * round trip this rule exists to make unreachable. Every place in the form
 * that means "has this been saved" reads `isSaved` here, not `serviceId`
 * or `editing` directly, so there is exactly one place to get it right.
 */
export interface ServiceLifecycle {
  /** Whether the service exists on the server yet. */
  isSaved: boolean;
  /**
   * Whether `bookingMode` can still be chosen.
   *
   * Only before the first save — `service.update` carries no field for it,
   * because changing it out from under a service that may already have
   * priced options (or a quote form) would leave one of the two in a shape
   * the other invariant refuses.
   */
  canChangeBookingMode: boolean;
  /**
   * Whether the options editor has anywhere to write to.
   *
   * `service.options.add` needs a real `serviceId`, and only a priced
   * service may have any options at all.
   */
  showOptionsEditor: boolean;
}

export function serviceLifecycle(input: {
  serviceId: string | null;
  bookingMode: ServiceBookingMode;
}): ServiceLifecycle {
  const isSaved = input.serviceId !== null;
  return {
    isSaved,
    canChangeBookingMode: !isSaved,
    showOptionsEditor: isSaved && input.bookingMode === "priced",
  };
}

/**
 * What "in person" expands to once it is chosen.
 *
 * `at_provider` first: the common case for the trades this market launches
 * with is a shop or a workspace the customer travels to, not a house call.
 */
export const IN_PERSON_LOCATION_TYPES: readonly ServiceLocationType[] = [
  "at_provider",
  "at_customer",
  "flexible",
];

// ─────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────

/**
 * An option's own form state.
 *
 * Every number is a string: an input the person can type "300,50" into has
 * to hold exactly what they typed, including the comma, until it is parsed —
 * a numeric field would have silently rejected or mangled it before this
 * code ever saw it.
 */
export interface OptionDraft {
  name: string;
  pricingMode: ServicePricingMode;
  amount: string;
  /** Fixed only. */
  duration: string;
  /** Hourly only. */
  min: string;
  /** Hourly only. */
  step: string;
}

/**
 * MZN only. The MVP launches in one market; a currency picker is scope this
 * task's brief does not ask for, and the wallet panel makes the same call
 * for the same reason.
 */
export const DEFAULT_OPTION_CURRENCY = "MZN";

export function emptyOptionDraft(): OptionDraft {
  return { name: "", pricingMode: "fixed", amount: "", duration: "", min: "", step: "" };
}

/** Seeds an option's draft from the server's copy, for editing. */
export function optionDraftFrom(option: ServiceOption, sourceLocale: Locale): OptionDraft {
  const source = option.translations.find((t) => t.locale === sourceLocale);
  return {
    name: source?.name ?? "",
    pricingMode: option.pricingMode,
    amount: String(option.amountMinor / 100).replace(".", ","),
    duration: option.durationMinutes !== null ? String(option.durationMinutes) : "",
    min: option.minMinutes !== null ? String(option.minMinutes) : "",
    step: option.stepMinutes !== null ? String(option.stepMinutes) : "",
  };
}

/**
 * The written price, in minor units — cents, not the number typed.
 *
 * Accepts a comma as the decimal separator as well as a dot, because that is
 * how the amount is written in the market this launches in; refusing it
 * would make the form wrong there. Anything else — letters, a second
 * separator, a thousands grouping — is refused rather than guessed at,
 * `null` standing for "not a price" the same way an empty field is one.
 */
export function parseAmountMinor(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function isPositiveIntString(value: string): boolean {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) >= 1;
}

export type OptionFieldErrors = Partial<Record<"amount" | "duration" | "min" | "step", string>>;

/**
 * Which of an option's fields are not fit to submit yet.
 *
 * The two pricing modes ask for different fields on purpose — a fixed
 * option's duration is the block the customer books, an hourly one's
 * minimum and step are what the customer chooses within — and this is the
 * one place that rule is enforced client-side, mirroring
 * `assertOptionShape` on the server so the same combination the server
 * would refuse with `OPTION_DURATION_REQUIRED` never reaches it.
 */
export function optionErrors(
  draft: Pick<OptionDraft, "pricingMode" | "amount" | "duration" | "min" | "step">,
): OptionFieldErrors {
  const errors: OptionFieldErrors = {};

  const amountMinor = parseAmountMinor(draft.amount);
  if (amountMinor === null || amountMinor <= 0) errors.amount = "invalid";

  if (draft.pricingMode === "fixed") {
    if (!isPositiveIntString(draft.duration)) errors.duration = "required";
  } else {
    if (!isPositiveIntString(draft.min)) errors.min = "required";
    if (!isPositiveIntString(draft.step)) errors.step = "required";
  }

  return errors;
}

/** Whether the option's draft is ready to send — every field valid, and named. */
export function optionCanSubmit(draft: OptionDraft): boolean {
  return draft.name.trim().length > 0 && Object.keys(optionErrors(draft)).length === 0;
}

export interface OptionMutationInput {
  name: string;
  pricingMode: ServicePricingMode;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
}

/**
 * The draft, converted into what `service.options.add`/`update` expect.
 *
 * Only meaningful once `optionCanSubmit` is true — the parses below fall
 * back to `0`/`null` rather than throwing, because this is a pure mapping,
 * not a second validation pass.
 */
export function toOptionInput(draft: OptionDraft): OptionMutationInput {
  const fixed = draft.pricingMode === "fixed";
  return {
    name: draft.name.trim(),
    pricingMode: draft.pricingMode,
    amountMinor: parseAmountMinor(draft.amount) ?? 0,
    currency: DEFAULT_OPTION_CURRENCY,
    durationMinutes: fixed ? (parseInt(draft.duration, 10) || null) : null,
    minMinutes: fixed ? null : (parseInt(draft.min, 10) || null),
    stepMinutes: fixed ? null : (parseInt(draft.step, 10) || null),
  };
}

/**
 * The list with one row moved by `delta` places.
 *
 * The same function the admin category list uses for its drag path and its
 * move-up/move-down menu, copied here rather than shared across features:
 * both need the drag path and the menu path to produce the same result from
 * the same code, and that guarantee only has to hold within one list.
 * Clamped: moving the first row up is a no-op, not a wrap to the bottom.
 */
export function moved<T extends { id: string }>(
  rows: readonly T[],
  id: string,
  delta: number,
): T[] {
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0) return [...rows];
  const to = Math.min(Math.max(from + delta, 0), rows.length - 1);
  if (to === from) return [...rows];
  const next = [...rows];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}
