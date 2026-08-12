import type { ServiceDTO, ServicePublicOptionDTO } from "./types";

/**
 * What a card's price area shows.
 *
 * Keyed off `bookingMode` first, never off whether a default option exists.
 * A `priced` service between being created and getting its first option is a
 * state the provider's own form can produce — `service.all` never publishes
 * one (`canPublish` refuses a `priced` service with no options), but a
 * defensive read must still not tell a customer their fixed-price service is
 * "By quote" just because it currently has nothing to show. `quote`
 * short-circuits before `defaultOption` is even inspected, since a quote
 * service is never expected to carry one.
 */
export type ServicePriceCell =
  | { kind: "quote" }
  | { kind: "priced"; option: ServicePublicOptionDTO }
  | { kind: "unavailable" };

export function servicePriceCell(service: ServiceDTO): ServicePriceCell {
  if (service.bookingMode === "quote") return { kind: "quote" };
  return service.defaultOption
    ? { kind: "priced", option: service.defaultOption }
    : { kind: "unavailable" };
}

/**
 * The amount to lead a card with: what a fixed job costs, or what one hour
 * of an hourly one costs.
 *
 * No "per hour" suffix here — that is a translated string, and appending an
 * English one in a domain function would put it in front of every locale
 * that calls this. The UI decides whether to show it, from
 * `option.pricingMode`.
 */
export function formatOptionAmount(
  option: ServicePublicOptionDTO,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: option.currency,
  }).format(option.amountMinor / 100);
}

/**
 * The minutes to show beside the price: the fixed job's own length, or the
 * hourly option's minimum booking.
 *
 * Never both. An hourly option's `durationMinutes` is null precisely
 * because the customer, not the provider, decides how long the job runs —
 * `minMinutes` is the only number that option has to offer here.
 */
export function optionDurationMinutes(
  option: ServicePublicOptionDTO,
): number | null {
  return option.pricingMode === "hourly"
    ? option.minMinutes
    : option.durationMinutes;
}

/**
 * The image to lead a card with: the service's own first photo, or the
 * provider's when it has none.
 *
 * A card with neither is what this function exists to prevent — a listing
 * grid where half the tiles are blank reads as broken, not as "no photo
 * yet".
 */
export function serviceCardImage(
  service: ServiceDTO,
  providerImageUrl: string | null,
): string | null {
  return service.imageUrls[0] ?? providerImageUrl ?? null;
}
