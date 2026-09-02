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
 * It is nullable today because the Booking context does not exist yet — its
 * table is a placeholder carrying an id, a customer and a status, with no
 * column saying *which provider* the booking was for, so there is nothing to
 * check against. Nullable rather than absent so the column is already here when
 * Booking arrives, and the rows written before it can be told apart from the
 * ones written after. See `ReviewEligibilityPort`.
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
    /**
     * When an administrator chose to show this review on the home page, or
     * null for the overwhelming majority that nobody has.
     *
     * A timestamp rather than a boolean, because the home page needs an order
     * as well as a set: it shows the four most recently featured, so
     * re-featuring a review is also how you move it to the front. A boolean
     * would need a second column to say the same thing.
     *
     * Deliberately independent of `status`. A hidden review must never reach
     * the home page, but hiding one does not unfeature it — an administrator
     * who unhides it should get back the state they had, not a silently
     * cleared choice. The query is what ANDs the two; see
     * `listFeatured`.
     */
    featuredAt: timestamp("featured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("review_one_per_author_per_provider").on(t.providerId, t.authorUserId),
    // The directory's ordering and every provider's average are both "the
    // published reviews of this business", which is this index.
    index("review_provider_status_idx").on(t.providerId, t.status),
    // Partial, on the handful of rows that are actually featured. The home
    // page's query is "published and featured, newest featured first", and a
    // full index on a nullable column would be almost entirely nulls — this
    // one holds four rows on a table meant to grow to millions.
    index("review_featured_idx")
      .on(t.featuredAt.desc())
      .where(sql`${t.featuredAt} IS NOT NULL AND ${t.status} = 'published'`),
    check("review_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    check("review_status_known", sql`${t.status} IN ('published', 'hidden')`),
  ],
);

export type ReviewRecord = typeof review.$inferSelect;
export type NewReviewRecord = typeof review.$inferInsert;
