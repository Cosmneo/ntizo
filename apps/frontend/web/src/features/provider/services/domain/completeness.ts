/**
 * The service editor's completeness rules.
 *
 * Source of truth: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/service-rules.ts`,
 * `canPublish`. Its order of checks — category, then source name, then
 * performers, then the booking-mode checks — is mirrored exactly by
 * `publishBlocker` below. A change to that function's order, or to the codes
 * it throws, needs a matching change here: the rail's disabled-Publish
 * message only means anything if it names the same problem the server would
 * have, and points at it before the round trip that would otherwise surface
 * it.
 */

export type SectionId = "basics" | "pricing" | "performers" | "timing" | "languages";

export interface CompletenessInput {
  categoryId: string | null;
  /** The name in the service's source locale, already trimmed. */
  sourceName: string;
  bookingMode: "priced" | "quote";
  optionCount: number;
  memberIds: readonly string[];
  /** One member means the performers question has one answer and is not asked. */
  individualProvider: boolean;
}

export interface SectionState {
  id: SectionId;
  required: boolean;
  complete: boolean;
  /** The server code this section's incompleteness corresponds to, or null. */
  blockingCode:
    | "SERVICE_CATEGORY_REQUIRED"
    | "SERVICE_NAME_REQUIRED"
    | "SERVICE_NEEDS_OPTION"
    | "SERVICE_QUOTE_HAS_OPTIONS"
    | "SERVICE_NEEDS_MEMBER"
    | null;
}

type BasicsCode = "SERVICE_CATEGORY_REQUIRED" | "SERVICE_NAME_REQUIRED" | null;
type PricingCode = "SERVICE_NEEDS_OPTION" | "SERVICE_QUOTE_HAS_OPTIONS" | null;
type PerformersCode = "SERVICE_NEEDS_MEMBER" | null;

/**
 * Category, then the source name — `canPublish`'s own first two checks, in
 * its own order, both folded into one section because the form asks them on
 * the same screen.
 */
function basicsCode(input: CompletenessInput): BasicsCode {
  if (!input.categoryId) return "SERVICE_CATEGORY_REQUIRED";
  if (input.sourceName.trim().length === 0) return "SERVICE_NAME_REQUIRED";
  return null;
}

/**
 * `canPublish`'s `memberCount === 0` check.
 *
 * Callers must not apply this to an individual provider — the server seeds
 * their one member on create, so `memberCount` is never `0` for them, and
 * asking the question here would report a rule the server never actually
 * enforces against them.
 */
function performersCode(input: CompletenessInput): PerformersCode {
  return input.memberIds.length === 0 ? "SERVICE_NEEDS_MEMBER" : null;
}

/** `canPublish`'s two booking-mode checks: a priced service needs an option, a quote service refuses one. */
function pricingCode(input: CompletenessInput): PricingCode {
  if (input.bookingMode === "priced" && input.optionCount === 0) return "SERVICE_NEEDS_OPTION";
  if (input.bookingMode === "quote" && input.optionCount > 0) return "SERVICE_QUOTE_HAS_OPTIONS";
  return null;
}

/**
 * Every section the rail can show, basics first through languages last — the
 * order the form itself walks the provider through, not the order
 * `publishBlocker` checks in (see that function for the server's own order,
 * which this array does not follow).
 *
 * `performers` is omitted outright for an individual provider, not included
 * and marked permanently complete: the server seeds their one member on
 * create, so there is no question here to ask, and a section that can never
 * be anything but green would misreport a settled fact as a task finished.
 */
export function sectionStates(input: CompletenessInput): SectionState[] {
  const basics = basicsCode(input);
  const pricing = pricingCode(input);

  const states: SectionState[] = [
    { id: "basics", required: true, complete: basics === null, blockingCode: basics },
    { id: "pricing", required: true, complete: pricing === null, blockingCode: pricing },
  ];

  if (!input.individualProvider) {
    const performers = performersCode(input);
    states.push({
      id: "performers",
      required: true,
      complete: performers === null,
      blockingCode: performers,
    });
  }

  states.push(
    { id: "timing", required: false, complete: true, blockingCode: null },
    { id: "languages", required: false, complete: true, blockingCode: null },
  );

  return states;
}

/**
 * The first blocking code, in `canPublish`'s own order: category, then
 * source name, then performers, then the booking-mode checks.
 *
 * Deliberately not derived by scanning `sectionStates`' array — that array
 * is ordered for the rail, not for this — so this function's order is its
 * own, and it is the one that has to keep matching the server's.
 */
export function publishBlocker(input: CompletenessInput): SectionState["blockingCode"] {
  const basics = basicsCode(input);
  if (basics) return basics;

  if (!input.individualProvider) {
    const performers = performersCode(input);
    if (performers) return performers;
  }

  return pricingCode(input);
}

/**
 * How many of the sections that must be complete before publish, are.
 *
 * Optional sections (timing, languages) never enter either number —
 * they are furniture the rail shows, not progress the provider is being
 * asked to finish before Publish stops being disabled.
 */
export function requiredProgress(states: readonly SectionState[]): { done: number; total: number } {
  const required = states.filter((s) => s.required);
  return { done: required.filter((s) => s.complete).length, total: required.length };
}
