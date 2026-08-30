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
 * `serviceStatus` and `optionIsActive` are required for the same reason. BR1 is
 * "the service must be published and the option active at creation", and the
 * command cannot check either half against data it was never given. They are
 * separate fields rather than one `bookable` flag because the two failures need
 * different words: a service that was never published is not the same news to a
 * customer as an option a provider has since retired, and a link bookmarked
 * yesterday produces the second far more often than the first.
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
  /** The *option*: a provider can retire one without unpublishing the service. */
  optionIsActive: boolean;
  /** The *option*: `fixed` carries a duration, `hourly` does not. */
  pricingMode: ServicePricingMode;
  amountMinor: number;
  currency: string;
  /** `fixed` only. Null for `hourly`, which has a minimum and a step instead. */
  durationMinutes: number | null;
}

export interface ServicePricingReaderPort {
  /**
   * Null means no such option. It does not mean "not bookable" — an inactive
   * option, an unpublished service and a quote service all come back with
   * their real values, so the caller can say which one it is. Folding those
   * into null would make every refusal read "that does not exist" to a
   * customer looking at a page that plainly shows it does.
   */
  findOption(serviceOptionId: string, locale: string): Promise<ServiceOptionPricing | null>;
}
