/**
 * The customer's handset, read out of the User context.
 *
 * Accepting a quote opens a booking that must be reachable by phone the same
 * way any other booking is, so `AcceptQuoteCommand` needs to know a number
 * exists before it commits to opening one — see
 * `QuoteNoCustomerPhoneError`. `profile.phone_number` is nullable, with
 * nothing in the platform requiring it today, which is why this returns
 * `string | null` rather than a number it promises to have.
 *
 * A reader on this context's side of the line rather than a call into User's
 * use cases, matching Booking's own `CustomerPhoneReaderPort`: one column,
 * read directly, with no aggregate loaded and no behaviour borrowed.
 */
export interface CustomerPhoneReaderPort {
  /**
   * @param userId the quote's `customerId`
   * @returns the stored number in whatever form it was saved, or `null` when there is none
   */
  findPhoneNumber(userId: string): Promise<string | null>;
}
