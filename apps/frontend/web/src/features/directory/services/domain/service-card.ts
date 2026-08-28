import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
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
  /**
   * More than one option, so the card leads with the cheapest and says so.
   *
   * A separate kind rather than a flag on `priced`, because what can be shown
   * is genuinely different: the amount is the *cheapest* option's, and this
   * card knows nothing else about that option — not its duration, not whether
   * it is hourly. Printing the default option's "· 30 min" beside another
   * option's price would be two facts about two different things read as one.
   */
  | { kind: "from"; amountMinor: number; currency: string }
  | { kind: "unavailable" };

export function servicePriceCell(service: ServiceDTO): ServicePriceCell {
  if (service.bookingMode === "quote") return { kind: "quote" };
  if (!service.defaultOption) return { kind: "unavailable" };
  // The cheapest is only worth saying when it is not the only one. With a
  // single option "from 500" invites the reader to look for a cheaper price
  // that cannot exist.
  if (service.optionCount > 1 && service.fromAmountMinor !== null) {
    return {
      kind: "from",
      amountMinor: service.fromAmountMinor,
      currency: service.defaultOption.currency,
    };
  }
  return { kind: "priced", option: service.defaultOption };
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
  return formatAmount(option.amountMinor, option.currency, locale);
}

/**
 * Any amount in minor units, in the reader's locale.
 *
 * Split out of `formatOptionAmount` when the card began showing a price that
 * belongs to no option it holds — the cheapest one, which arrives as a bare
 * number beside the default option it is not.
 */
export function formatAmount(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    amountMinor / 100,
  );
}

/**
 * Any amount in minor units, as a headline price rather than a total.
 *
 * Whole units only, `useGrouping: "always"`: a rail's headline and a service
 * row's price cell are the same kind of number the browse cards already
 * print — `ProviderListingCard` and `ServiceListingCard` each carry their own
 * private `formatPrice` twin of this, with the same shape, for the same
 * reason recorded on both: two cards in the same product disagreeing about
 * whether this platform writes "800 MZN" or "800,00 MZN" is worse than either
 * choice, and the approved mockup writes whole units. `useGrouping: "always"`
 * exists because `pt-MZ` and `pt-PT` set `minimumGroupingDigits: 2`, which
 * would otherwise leave a four-digit price ungrouped — "1200 MZN" against the
 * mockup's "1 200 MZN".
 *
 * `formatAmount` above is not this function with two fewer digits — it stays
 * exactly as it is for `RailPriceSummary`'s breakdown lines and its total,
 * because a checkout total is what the customer actually pays and cannot be
 * rounded. A rail headline and a row price are headlines: an approximation
 * announcing itself as one, not a number anybody is charged.
 */
export function formatHeadlinePrice(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(amountMinor / 100);
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
 * What the service page's right column shows: the price rail
 * (`RailPriceSummary`), or one of two notices in place of it.
 *
 * Keyed off `bookingMode` first, never off `options.length` — the same rule
 * `servicePriceCell` states above and for the same reason. `service-detail-page.tsx`
 * used to branch on `service.options.length === 0` directly, which reads a
 * `priced` service with no *active* options as a `quote` one. That state is
 * reachable, not theoretical: `canPublish` refuses to publish a `priced`
 * service with zero options, but it runs once, at publish time, and is never
 * re-run afterwards. Deactivating a service's last option later — a normal
 * provider action — leaves a published, `priced` service behind, and
 * `getPublishedById` filters `options` to active ones only, so this page then
 * sees exactly what a `quote` service looks like on the wire: an empty array.
 *
 * `unavailable` is `servicePriceCell`'s own name for this same situation on a
 * browse card (a `priced` service with no `defaultOption`), reused rather than
 * inventing a fourth word for one fact. It is deliberately not `quote`: a
 * `quote` service has never had a price, and telling a `priced` one's customer
 * to "contact the provider to get a price" would be wrong advice, not merely
 * mislabelled — the price already exists, only its packages are (probably
 * temporarily) gone. `ServicePackagesUnavailable` is the page's answer for it,
 * and it is not `ServiceQuoteNotice` reused.
 */
export type ServiceDetailPanel =
  | { kind: "quote" }
  | { kind: "unavailable" }
  | { kind: "packages" };

export function serviceDetailPanel(service: ServiceDetailDTO): ServiceDetailPanel {
  if (service.bookingMode === "quote") return { kind: "quote" };
  if (service.options.length === 0) return { kind: "unavailable" };
  return { kind: "packages" };
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
