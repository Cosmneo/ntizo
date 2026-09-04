import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
 * **`MARKED_DONE` and `COMPLETED`, and nothing else** — imported as
 * `BookingStatus.*`, never typed out as literals, so this cannot silently
 * drift from the status list `booking.schema.ts` checks the column against.
 *
 * `MARKED_DONE` was excluded here on the reasoning that it is the provider's
 * claim that the job is done rather than the customer's agreement to it. That
 * is exactly right about what the status means and exactly backwards about
 * what to do with it: the customer's review IS that agreement, and the
 * platform wants it during the three-day dispute window, not after. Keeping
 * the door shut until the window closed meant the one moment the customer is
 * actually thinking about the job was the one moment they could not say
 * anything, and it made writing a review a second button after "yes, it was
 * done" instead of the answer itself. `SubmitReviewCommand` closes the
 * booking on the way out, so a review written here is what ends the window.
 *
 * **The two admitted statuses are the two that mean the appointment
 * happened, and every other one is still refused.** `CONFIRMED` is a paid
 * booking whose appointment may not have started; `DISPUTED` is the customer
 * saying the opposite of a review; `DECLINED`, `CANCELLED` and `EXPIRED` are
 * bookings that never happened; the rest are earlier still. None of them is
 * service delivered.
 *
 * A customer can have several such bookings with the same provider but only
 * one review, so ties are broken by whichever column knows when the job was
 * done, most recent first — the review points at the job they most recently
 * had done, not the first one they ever booked.
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
          inArray(booking.status, [BookingStatus.MarkedDone, BookingStatus.Completed]),
        ),
      )
      // A marked-done booking has no `completed_at` yet, and in Postgres
      // `ORDER BY … DESC` is NULLS FIRST by default — so ordering by that
      // column alone would sort every marked-done booking *ahead* of every
      // completed one no matter how old it is, and would leave several
      // marked-done ones tied on NULL in whatever order the plan happened to
      // produce. Either way the review lands on the wrong job. Both columns
      // are stamped by the hop that set the status, so the coalesce reads
      // "when was this job done", whichever door it came through.
      .orderBy(desc(sql`coalesce(${booking.completedAt}, ${booking.markedDoneAt})`))
      .limit(1);

    if (!row) return { allowed: false, bookingId: null };
    return { allowed: true, bookingId: row.id };
  }
}
