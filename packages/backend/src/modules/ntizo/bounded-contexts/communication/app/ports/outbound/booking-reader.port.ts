/**
 * The one thing Communication needs to know about a booking: whether the
 * person (or provider) attaching it to a support request may. A cross-BC
 * port, like `ProviderReaderPort` — one boolean off one row, no dependency
 * on Booking's bootstrap.
 */
export interface BookingReaderPort {
  /**
   * For a personal request (`providerId` null): the booking's customer is
   * `userId`. For a provider request: the booking's provider is
   * `providerId` — any member may ask about any of the provider's bookings.
   * A booking that does not exist answers `false`, indistinguishable from
   * one that is somebody else's.
   */
  isOwnedBy(bookingId: string, requester: { userId: string; providerId: string | null }): Promise<boolean>;
}
