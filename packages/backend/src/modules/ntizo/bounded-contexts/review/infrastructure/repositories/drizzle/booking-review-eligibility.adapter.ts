import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import { BookingStatus } from "../../../../../shared/infrastructure/database/booking/enums";
import type {
  ReviewEligibility,
  ReviewEligibilityPort,
} from "../../../app/ports/outbound/review-eligibility.port";

/**
 * The eligibility adapter for a platform that has bookings.
 *
 * Replaces `OpenReviewEligibilityAdapter`, which said yes to everyone because
 * `ntizo_booking.booking` had no column saying which provider a booking was
 * for — there was no query that could answer this correctly. There is now:
 * this looks up the customer's own bookings against this provider and answers
 * from `status` and `providerId`.
 *
 * **`COMPLETED` only** — imported as `BookingStatus.Completed`, never typed
 * out as a literal, so this cannot silently drift from the status list
 * `booking.schema.ts` checks the column against. `MARKED_DONE` is the
 * provider's claim that the job is done, not the customer's agreement to it;
 * every status before that is a booking nothing has happened on yet. A review
 * is earned by service delivered, and `COMPLETED` is the only status that
 * means that.
 *
 * A customer can have several completed bookings with the same provider but
 * only one review, so ties are broken by `completedAt`, most recent first —
 * the review points at the job they most recently had done, not the first one
 * they ever booked.
 */
export class BookingReviewEligibilityAdapter implements ReviewEligibilityPort {
  async check(providerId: string, userId: string): Promise<ReviewEligibility> {
    const [row] = await getDb()
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          eq(booking.providerId, providerId),
          eq(booking.customerId, userId),
          eq(booking.status, BookingStatus.Completed),
        ),
      )
      .orderBy(desc(booking.completedAt))
      .limit(1);

    if (!row) return { allowed: false, bookingId: null };
    return { allowed: true, bookingId: row.id };
  }
}
