/**
 * Everything the Booking context needs to open a booking that already
 * carries a price, a date and a duration — the one it never has to ask a
 * customer for, because a quote already settled all three. Declared again
 * here rather than imported from Booking's own input shape, for the reason
 * `raise-notification.port.ts` gives: no `app/` tree imports another
 * context's `app/` tree.
 *
 * `serviceName` and `address` travel as values, not as a service id and a
 * lookup Booking would have to perform a second time: the quote already
 * carries its own snapshot of both (`QuoteServiceSnapshot.serviceName` at
 * request time, `Quote.address*` fields at acceptance), and handing the
 * snapshot across is cheaper and less prone to disagreement than asking the
 * other side to re-derive it.
 */
export interface OpenBookingFromQuoteInput {
  quoteId: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  providerMemberId: string;
  startsAt: Date;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  serviceName: string;
  address: {
    label: string;
    line: string;
    city: string;
    district: string | null;
    directions: string | null;
    lat: number | null;
    lng: number | null;
  };
  description: string | null;
  acceptedByUserId: string;
}

/**
 * The booking context, from the quote's side. Called INSIDE the acceptance
 * transaction; a calendar refusal must surface as `QuoteSlotTakenError` so the
 * whole transaction rolls back — the adapter at the composition root does that
 * translation.
 */
export interface BookingOpenerPort {
  openFromQuote(input: OpenBookingFromQuoteInput): Promise<{ bookingId: string; payBy: Date }>;
}
