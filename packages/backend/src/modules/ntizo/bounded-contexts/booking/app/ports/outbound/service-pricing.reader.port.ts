import type {
  ServiceBookingMode,
  ServicePricingMode,
  ServiceStatus,
} from "@ntizo/shared";

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
 * `bookingMode` and `pricingMode` answer different questions about different
 * entities. `service.booking_mode` is `priced` or `quote` and belongs to the
 * service; `service_option.pricing_mode` is `fixed` or `hourly` and belongs to
 * the option. A `quote` service has no options at all (the domain refuses to
 * create them), so `pricingMode` can never be `"quote"`. `bookingMode` is what
 * lets Task 8 refuse a quote service without a second round trip — it is a
 * genuine guard: an option id from another service must not become a booking
 * against a service that carries no prices.
 *
 * `serviceStatus` is required for the same reason. BR1 says only a published
 * service may be booked, and the command cannot check that against data it was
 * never given.
 */
export interface ServiceOptionPricing {
  serviceId: string;
  providerId: string;
  serviceName: string;
  optionName: string;
  /** The *service*: `priced` carries options, `quote` carries a form. */
  bookingMode: ServiceBookingMode;
  /** The *service*: only `published` may be booked. */
  serviceStatus: ServiceStatus;
  /** The *option*: `fixed` carries a duration, `hourly` does not. */
  pricingMode: ServicePricingMode;
  amountMinor: number;
  currency: string;
  /** `fixed` only. Null for `hourly`, which has a minimum and a step instead. */
  durationMinutes: number | null;
}

export interface ServicePricingReaderPort {
  /**
   * Fetch the price, duration, names, booking mode, and status for a service option.
   *
   * Returns null if the option does not exist.
   *
   * @param serviceOptionId The id of the service option to fetch
   * @param locale The locale (language-region) to use for fetching translated names
   */
  findOption(serviceOptionId: string, locale: string): Promise<ServiceOptionPricing | null>;
}
