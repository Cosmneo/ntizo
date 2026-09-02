/**
 * The commission rate is read rather than assumed because it is per provider
 * and an administrator can change it. A booking that hardcodes 10% will show
 * the wrong fee for any provider whose rate was adjusted after the platform
 * launched (or the next morning, when a business negotiated a different rate).
 *
 * The rate, name, and slug are all read at booking creation and copied onto the
 * booking aggregate. That copy is what that booking will use forever — a later
 * change to the provider's configuration never rewrites a sale that already
 * completed. This ensures that a provider who renames themselves does not rewrite
 * the sale that already happened, and that the fee stays reproducible:
 * `priceMinor` is what the customer was told, and `priceMinor - commissionMinor`
 * is what the provider receives.
 *
 * Returns null when the provider does not exist, so the caller can distinguish
 * "this provider has no special rate set" (zero commission, a real and allowed
 * rate) from "this provider was not found" (an error the caller must handle).
 */
export interface ProviderSnapshot {
  commissionBps: number;
  name: string;
  slug: string;
}

export interface ProviderSnapshotReaderPort {
  /**
   * Fetch the provider snapshot for booking: commission rate, display name, and slug.
   *
   * Returns null if the provider does not exist. Returns the snapshot (including
   * a zero commission rate) if the provider exists.
   *
   * @param providerId The id of the provider
   */
  findForBooking(providerId: string): Promise<ProviderSnapshot | null>;
}
