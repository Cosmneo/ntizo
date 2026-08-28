import {
  optionDurationMinutes,
  servicePriceCell,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

export interface StubParts {
  /** A key in the `directory` namespace, for the eyebrow above the amount. */
  eyebrowKey: string;
  amount:
    | { kind: "money"; amountMinor: number; currency: string }
    | { kind: "key"; key: string };
  /**
   * One line under the amount, as a key and its interpolations.
   *
   * `count` rather than `minutes`, because that is what
   * `serviceDurationMinutes` and `serviceMinimumMinutes` already interpolate in
   * all eight locales — and what the availability grid, the package chooser and
   * the provider's own service card have always passed them. Renaming it here
   * would mean editing sixteen strings to say the same thing.
   */
  under?: { key: string; values: Record<string, number> };
  variant: "primary" | "quiet";
}

/**
 * What a service's price rail says.
 *
 * Built on `servicePriceCell`, which already decides the hard part and keys
 * off `bookingMode` before it ever inspects `defaultOption` — read its doc
 * comment before changing anything here. This adds only what the stub needs on
 * top: which eyebrow, which line underneath, and whether the button should be
 * loud.
 *
 * `quiet` wherever the destination cannot be paid for: a solid brand-blue CTA
 * beside a price of "to agree" promises a checkout that does not exist.
 */
export function serviceStubParts(service: ServiceDTO): StubParts {
  const cell = servicePriceCell(service);

  if (cell.kind === "quote") {
    return {
      eyebrowKey: "filterPaymentOption.quote",
      amount: { kind: "key", key: "stubQuoteAmount" },
      variant: "quiet",
    };
  }
  if (cell.kind === "unavailable") {
    // Deliberately not `quote`. See `serviceDetailPanel`'s comment: a `priced`
    // service whose last option was deactivated is reachable and normal, and
    // telling its customer to ask for a price is wrong advice.
    return {
      eyebrowKey: "filterPaymentOption.fixed",
      amount: { kind: "key", key: "priceUnavailable" },
      variant: "quiet",
    };
  }
  if (cell.kind === "from") {
    // No duration. The amount belongs to the *cheapest* option and this card
    // knows nothing else about it — printing the default option's length
    // beside another option's price is two facts about two things read as one.
    return {
      eyebrowKey: "providerFrom",
      amount: { kind: "money", amountMinor: cell.amountMinor, currency: cell.currency },
      variant: "primary",
    };
  }

  const minutes = optionDurationMinutes(cell.option);
  return {
    eyebrowKey: `filterPaymentOption.${cell.option.pricingMode === "hourly" ? "hourly" : "fixed"}`,
    amount: { kind: "money", amountMinor: cell.option.amountMinor, currency: cell.option.currency },
    ...(minutes != null
      ? {
          under: {
            // Two different sentences: a fixed job has a length, an hourly one
            // has a minimum the customer must book.
            key:
              cell.option.pricingMode === "hourly"
                ? "serviceMinimumMinutes"
                : "serviceDurationMinutes",
            values: { count: minutes },
          },
        }
      : {}),
    variant: "primary",
  };
}
