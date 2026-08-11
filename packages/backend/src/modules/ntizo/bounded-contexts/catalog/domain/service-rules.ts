import {
  OptionDurationError,
  OptionPriceInvalidError,
  ServiceCategoryRequiredError,
  ServiceNameRequiredError,
  ServiceNeedsOptionError,
  QuoteServiceHasOptionsError,
} from "./exceptions";

export interface OptionShape {
  pricingMode: "fixed" | "hourly";
  amountMinor: number;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
}

/**
 * The duration fields belong to exactly one pricing mode.
 *
 * Stated here as well as in the CHECK, and both are needed: this is the rule
 * where a person can read it and where the error carries a code the form can
 * put under the right field, and the CHECK is what survives a script that
 * bypasses this.
 */
export function assertOptionShape(option: OptionShape): void {
  if (!Number.isInteger(option.amountMinor) || option.amountMinor <= 0) {
    throw new OptionPriceInvalidError();
  }

  if (option.pricingMode === "fixed") {
    if (option.durationMinutes === null) {
      throw new OptionDurationError(
        "OPTION_DURATION_REQUIRED",
        "A fixed-price option needs a duration",
      );
    }
    if (option.minMinutes !== null || option.stepMinutes !== null) {
      throw new OptionDurationError(
        "OPTION_DURATION_NOT_ALLOWED",
        "A fixed-price option has no minimum or step — its duration is the block",
      );
    }
    return;
  }

  if (option.durationMinutes !== null) {
    throw new OptionDurationError(
      "OPTION_DURATION_NOT_ALLOWED",
      "An hourly option has no fixed duration — the customer chooses how long",
    );
  }
  if (option.minMinutes === null || option.stepMinutes === null) {
    throw new OptionDurationError(
      "OPTION_DURATION_REQUIRED",
      "An hourly option needs a minimum and a step",
    );
  }
}

export interface DefaultableOption {
  id: string;
  isDefault: boolean;
  sortOrder: number;
}

/**
 * Exactly one default, or none when there are no options.
 *
 * The first by `sortOrder` wins when several claim it. Never invents one for
 * an empty list — a quote service legitimately has no options at all.
 */
export function withSingleDefault<T extends DefaultableOption>(options: readonly T[]): T[] {
  if (options.length === 0) return [];
  const ordered = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
  const chosen = ordered.find((o) => o.isDefault) ?? ordered[0]!;
  return ordered.map((o) => ({ ...o, isDefault: o.id === chosen.id }));
}

/** The list without `removedId`, with a default guaranteed among what is left. */
export function promoteNextDefault<T extends DefaultableOption>(
  options: readonly T[],
  removedId: string,
): T[] {
  return withSingleDefault(options.filter((o) => o.id !== removedId));
}

export interface PublishCheck {
  bookingMode: "priced" | "quote";
  categoryId: string | null;
  hasSourceName: boolean;
  optionCount: number;
}

/** Throws the first thing standing between this service and being published. */
export function canPublish(service: PublishCheck): void {
  if (!service.categoryId) throw new ServiceCategoryRequiredError();
  if (!service.hasSourceName) throw new ServiceNameRequiredError();
  if (service.bookingMode === "priced" && service.optionCount === 0) {
    throw new ServiceNeedsOptionError();
  }
  if (service.bookingMode === "quote" && service.optionCount > 0) {
    throw new QuoteServiceHasOptionsError();
  }
}
