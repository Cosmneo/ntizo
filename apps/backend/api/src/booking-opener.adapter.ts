import type { BookingBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import { SlotAlreadyTakenError } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import type { BookingOpenerPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";
import { QuoteSlotTakenError } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";

/**
 * The quote context's `BookingOpenerPort`, filled by the booking context's own
 * command — the same shape `bookingCompletionOver` uses for review → booking.
 *
 * **The one thing it does beyond forwarding is translate the calendar's
 * refusal.** `SlotAlreadyTakenError` is the booking context's word for it and
 * would reach the customer as a booking-shaped complaint about a quote they
 * were accepting; `QuoteSlotTakenError` is what `AcceptQuoteCommand` catches
 * to put the quote back in front of the provider, and what the accept page
 * knows how to explain.
 */
export function bookingOpenerOver(
  createBookingFromQuote: BookingBootstrap["useCases"]["createBookingFromQuote"],
): BookingOpenerPort {
  return {
    async openFromQuote(input) {
      try {
        return await createBookingFromQuote.execute(input);
      } catch (error) {
        if (error instanceof SlotAlreadyTakenError) throw new QuoteSlotTakenError();
        throw error;
      }
    },
  };
}
