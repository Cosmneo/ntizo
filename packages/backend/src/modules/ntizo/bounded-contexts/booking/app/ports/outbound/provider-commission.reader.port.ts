/**
 * The commission rate is read rather than assumed because it is per provider
 * and an administrator can change it. A booking that hardcodes 10% will show
 * the wrong fee for any provider whose rate was adjusted after the platform
 * launched (or the next morning, when a business negotiated a different rate).
 *
 * The rate is read at booking creation and copied onto the booking aggregate.
 * That copy is the rate that booking will use forever — a later change to the
 * provider's configuration never rewrites a sale that already completed. This
 * ensures that `priceMinor - commissionMinor` always equals what the customer
 * was told and what the provider receives stays reproducible.
 *
 * Returns null when the provider does not exist, so the caller can distinguish
 * "this provider has no special rate set" (zero commission, a real and allowed
 * rate) from "this provider was not found" (an error the caller must handle).
 */
export interface ProviderCommissionReaderPort {
  /**
   * Fetch the commission rate for a provider, in basis points.
   *
   * Returns null if the provider does not exist. Returns a number (including zero)
   * if the provider exists.
   *
   * @param providerId The id of the provider
   * @returns The commission rate in basis points (0–10000), or null if the provider was not found
   */
  findCommissionBps(providerId: string): Promise<number | null>;
}
