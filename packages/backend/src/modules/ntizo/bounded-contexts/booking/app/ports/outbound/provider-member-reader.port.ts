/**
 * Whether a person belongs to a provider, as the Booking context needs to
 * know it for `AcceptBookingCommand` and `DeclineBookingCommand`.
 *
 * An outbound port rather than an import of the Provider context: Booking
 * must not reach into another bounded context's tables, and the adapter
 * that implements this is the one place that coupling is written down —
 * the same reasoning Notification's own `ProviderMemberReaderPort` gives
 * for the identical shape (see that context's port of the same name). It
 * answers one question and no more: whether the caller may act on this
 * booking's provider at all, not what role they hold there. Only a member
 * of the booking's provider may accept or decline it — any member, not
 * only its owner or admin — so a boolean is the whole contract; there is no
 * second, narrower check either command needs on top of it.
 */
export interface ProviderMemberReaderPort {
  /** Whether `userId` belongs to `providerId`, in any role. */
  isMember(providerId: string, userId: string): Promise<boolean>;
}
