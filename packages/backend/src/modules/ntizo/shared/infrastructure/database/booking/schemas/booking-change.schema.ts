import { sql } from "drizzle-orm";
import { check, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";
import { bookingSchema, booking } from "./booking.schema";

/**
 * One row per change to a booking that has already been sold.
 *
 * Append-only, and the reason is the whole design: a booking is mutated in
 * place rather than cancelled and recreated, so that it keeps its id and its
 * payment reference. What that costs is the original sale's readability —
 * this table is what buys it back. Every hop stores what the booking was
 * before, so the first sale is never overwritten, only superseded.
 *
 * Nothing updates or deletes a row here. A correction is another row.
 *
 * The four `previous*` columns are nullable because a single hop rarely moves
 * all of them at once — a reschedule changes `previousStartsAt` and
 * `previousEndsAt` and leaves the other two null, a reassignment to a
 * different member changes only `previousProviderMemberId`, a price
 * adjustment changes only `previousPriceMinor`. A null here means "this hop
 * did not touch this field", not "this field had no value".
 *
 * Deleting the booking takes its change log with it (`cascade`): a change log
 * with nothing left to be a log *of* is not a record worth keeping, unlike
 * `review`, whose subject (the customer's experience) survives the booking
 * being removed.
 */
export const bookingChange = bookingSchema.table(
  "booking_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    /**
     * Who made this change, or **null when no human did**.
     *
     * Null is the honest encoding for a hop the platform itself made — today
     * exactly one: the cron sweep ending a booking whose clock ran out
     * (`SweepBookingCommand`). That hop has no requesting user, because
     * nobody requested it; a deadline passed.
     *
     * The alternative was a sentinel "system user" row, and it was rejected
     * on purpose. A synthetic id in this column would join cleanly to
     * `user`, which is exactly the problem: every "changes by user X" query,
     * every audit export and every future join would silently count machine
     * hops as somebody's actions, and nothing would ever go red. Null cannot
     * be mistaken for a person by anything that reads it.
     *
     * A reader wanting "who?" for a null row has `reason` — a machine token,
     * never prose (see `DeclineBookingCommand`'s own constant) — which names
     * what ended the booking. That pairing is why this column going nullable
     * does not lose information: the row still says what happened and why,
     * only not *who*, because there was no who.
     */
    changedByUserId: text("changed_by_user_id").references(() => user.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull(),

    // The previous values a hop can move. See the class doc above for why
    // these are nullable rather than required together.
    previousStartsAt: timestamp("previous_starts_at", { withTimezone: true }),
    previousEndsAt: timestamp("previous_ends_at", { withTimezone: true }),
    /**
     * Not a foreign key. The point of this column is what the booking *was*
     * assigned to before this hop — a member later removed from the provider
     * must not blank out or block that history, which is exactly what an FK
     * would do on their deletion.
     */
    previousProviderMemberId: uuid("previous_provider_member_id"),
    previousPriceMinor: integer("previous_price_minor"),
  },
  (t) => [
    check(
      "booking_change_previous_price_minor_non_negative",
      sql`${t.previousPriceMinor} IS NULL OR ${t.previousPriceMinor} >= 0`,
    ),
  ],
);

export type BookingChangeRow = typeof bookingChange.$inferSelect;
export type NewBookingChangeRow = typeof bookingChange.$inferInsert;
