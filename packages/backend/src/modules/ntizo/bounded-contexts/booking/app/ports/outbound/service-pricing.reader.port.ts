/**
 * Service and option names live in `service_translation` and
 * `service_option_translation`, so there is no single name to read from the
 * catalog. The booking snapshot records the name the customer was actually shown
 * at checkout time. That snapshot is built here, so the locale must be passed
 * in — the same locale the frontend showed — so the booking captures the right
 * name. If a provider later changes the service name or an administrator
 * adjusts the locale's translation, the booking still holds the name from the
 * moment the sale happened.
 *
 * `pricingMode` lets the caller refuse a `quote` service without a second round
 * trip to the catalog. A quote service has no fixed price; a booking flow that
 * does not yet know the price cannot complete the booking in one request. The
 * command must be able to say "this is a quote service, let the frontend know
 * to send the customer to the quote flow" without making the caller perform a
 * second read. `pricingMode` answers that question directly, so only one field
 * is needed (not also an `isQuote` boolean that could disagree).
 *
 * `durationMinutes` is nullable because the catalog's own CHECK constraint makes
 * it non-null for `fixed` and null for `hourly` and `quote`. Task 8 (the command)
 * refuses a booking without a duration; that is the command's rule to enforce,
 * not this port's rule to hide or repeat.
 */
export type ServicePricingMode = "fixed" | "hourly" | "quote";

export interface ServiceOptionPricing {
  serviceId: string;
  providerId: string;
  serviceName: string;
  optionName: string;
  pricingMode: ServicePricingMode;
  amountMinor: number;
  currency: string;
  /** `fixed` only. Null for the other modes, which have no single duration. */
  durationMinutes: number | null;
}

export interface ServicePricingReaderPort {
  /**
   * Fetch the price, duration, names, and pricing mode for a service option.
   *
   * Returns null if the option does not exist.
   *
   * @param serviceOptionId The id of the service option to fetch
   * @param locale The locale (language-region) to use for fetching translated names
   */
  findOption(serviceOptionId: string, locale: string): Promise<ServiceOptionPricing | null>;
}
