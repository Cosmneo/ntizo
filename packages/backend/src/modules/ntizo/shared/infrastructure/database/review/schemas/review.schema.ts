import {
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas";
import { booking } from "../../booking/schemas/booking.schema";

export const reviewSchema = pgSchema("ntizo_review");

/**
 * One customer's verdict on one business.
 *
 * **One per person per business, enforced in the database.** A provider's
 * average is only worth printing if it cannot be moved by the same account
 * voting twice, and a uniqueness rule that lives only in a command is a rule
 * two concurrent requests can both pass. Changing your mind updates the row you
 * already have rather than adding a second — see `SubmitReviewCommand`.
 *
 * `bookingId` is the seam for the eligibility rule this platform actually
 * wants: only somebody who has been served should be able to score the service.
 * `BookingReviewEligibilityAdapter` sets it on every new review, to the
 * customer's most recently `COMPLETED` booking with this provider. It stays
 * nullable for the reviews written before this rule was enforced — the column
 * existed before the check did, precisely so a row written under the old,
 * unenforced rule could still be told apart from one written after. See
 * `ReviewEligibilityPort`.
 *
 * `rating` is checked 1–5 in the database as well as in the aggregate. The
 * aggregate is the reason the rule is *understandable*; the constraint is the
 * reason it is *true*, including for a backfill script that never loads one.
 *
 * Deleting the author's account takes their reviews with it (`cascade`), which
 * is what "delete my data" has to mean. Deleting a provider does too: a review
 * of a business that no longer exists has nothing left to be about.
 */
export const review = reviewSchema.table(
  "review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The booking this review is about, once bookings exist.
     *
     * `set null` rather than `cascade`: a booking removed from the system does
     * not make the customer's experience of it untrue, and silently deleting
     * their review would look to them like censorship.
     */
    bookingId: uuid("booking_id").references(() => booking.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    /**
     * "published" | "hidden".
     *
     * Hidden rows stay in the table and stay out of every average — a removed
     * review that still counted would be the worst of both. Only an
     * administrator hides one; the author's own removal deletes the row.
     */
    status: text("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("review_one_per_author_per_provider").on(t.providerId, t.authorUserId),
    // The directory's ordering and every provider's average are both "the
    // published reviews of this business", which is this index.
    index("review_provider_status_idx").on(t.providerId, t.status),
    check("review_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    check("review_status_known", sql`${t.status} IN ('published', 'hidden')`),
  ],
);

export type ReviewRecord = typeof review.$inferSelect;
export type NewReviewRecord = typeof review.$inferInsert;
