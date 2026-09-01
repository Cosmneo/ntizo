/**
 * The customer's handset, read out of the User context.
 *
 * M-Pesa pushes a prompt to a *phone*, not to an account, so a charge cannot
 * be attempted without one — and `profile.phone_number` is nullable, with
 * nothing in the platform requiring it today. That is why this returns
 * `string | null` rather than a number it promises to have: the absence is
 * real, it is reachable through the shipped product, and the design's answer
 * is that it be treated as an ordinary charge failure rather than a special
 * case (see `ChargeBookingCommand`).
 *
 * A reader on Booking's side of the line rather than a call into User's use
 * cases, matching `ProviderSnapshotReaderPort` and `ProviderMemberReaderPort`:
 * one column, read directly, with no aggregate loaded and no behaviour
 * borrowed.
 */
export interface CustomerPhoneReaderPort {
  /**
   * @param userId the booking's `customerId`
   * @returns the stored number in whatever form it was saved, or `null` when there is none
   */
  findPhoneNumber(userId: string): Promise<string | null>;
}
