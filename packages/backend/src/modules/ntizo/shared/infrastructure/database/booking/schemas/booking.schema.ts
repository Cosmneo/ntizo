import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas/provider.schema";
import { providerMember } from "../../provider/schemas/provider-member.schema";
import { service, serviceOption } from "../../catalog/schemas/service.schema";
import { BOOKING_STATUSES, BookingStatus, DEADLINE_BEARING_STATUSES } from "../enums";

export const bookingSchema = pgSchema("ntizo_booking");

/**
 * Inlines a status list as literal SQL text, for a CHECK or an index
 * predicate — never as bound query parameters.
 *
 * `inArray` looks like the obvious tool for "is this column one of these
 * values" and was tried first. It is wrong here: `inArray` parameterizes its
 * values (`$1, $2, …`) because it is built for a runtime query executed over
 * a live connection, which has somewhere to send the bound values. A
 * migration `.sql` file is not that — it is static text with no params array
 * attached, so a CHECK or index `WHERE` built with `inArray` comes out of
 * `drizzle-kit generate` carrying literal, unbound `$N` placeholders and
 * fails the instant the migration is applied (confirmed against a throwaway
 * Postgres: `PostgresError: there is no parameter $1`, code `42P02`). Writing
 * that down here so nobody has to rediscover it by watching a migrate fail.
 *
 * `sql.raw` is normally the dangerous choice: it skips escaping entirely, and
 * a reader should stop and ask why before trusting it. It is safe in this one
 * spot because the values it is ever called with are members of a
 * compile-time enum defined in this repository — the parameter is typed
 * `readonly BookingStatus[]`, so passing anything else is a compile
 * error rather than something a reviewer has to notice. Convention would not
 * have been enough: the quoting here does no escaping at all, so a widened
 * parameter type is the only thing standing between this helper and a
 * string-concatenation bug in a migration file.
 *
 * The point of building the list from that constant at all (rather than
 * typing the statuses out by hand) is unchanged from `inArray`'s original
 * purpose: one list, read by both the TypeScript union and the database
 * constraint, not two that agree only by transcription and can silently
 * drift apart.
 */
const statusList = (values: readonly BookingStatus[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * A sale, from the moment a slot is held to whichever of its endings applies.
 *
 * **This is a snapshot, not a set of foreign keys to the catalog.** `serviceName`,
 * `providerName`, `providerSlug`, `optionName`, `durationMinutes`,
 * `commissionBps` and the whole address are copied onto the row at booking time
 * and never written again after (except by `booking_change`, which records a
 * *new* value rather than overwriting this one). A provider renaming a service,
 * moving address, or having their commission rate changed by an administrator
 * must not rewrite what a customer already bought — a receipt that changes
 * after the sale is not a receipt. Reading the current catalog for that
 * information would do exactly that the moment anything upstream changed, so
 * the columns exist instead of the joins.
 *
 * `status` is free text rather than a Postgres enum, matching this codebase's
 * other status columns — GraphQL and every reader see the same string a psql
 * session would. It is kept honest by `booking_status_known`, built from
 * `BOOKING_STATUSES` through the `statusList` helper below rather than a
 * hand-written list, so the constraint and the TypeScript union it is checked
 * against cannot drift apart. One nullable timestamp per transition
 * (`paidAt`, `confirmedAt`, …) records *when* each one happened, alongside
 * `status` recording *which one is current* — both are needed because a
 * booking can only be in one status at a time but its history is more than
 * its current status.
 *
 * Money is integer minor units throughout, never a float: `priceMinor` and
 * `commissionMinor` are what was actually charged, `commissionBps` is the rate
 * that produced them, snapshotted for the same reason as the catalog fields
 * above — the platform's default commission can change without rewriting a
 * sale that already happened at the old rate. All three are bounded by CHECK
 * constraints, not only validated by the command that inserts the row: a
 * constraint is still true for a backfill script or a manual `INSERT` that
 * never runs that command.
 */
export const booking = bookingSchema.table(
  "booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identity and parties.
    customerId: text("customer_id")
      .notNull()
      .references(() => user.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id),
    serviceOptionId: uuid("service_option_id")
      .notNull()
      .references(() => serviceOption.id),
    /** Which member's calendar this booking occupies. See the index below. */
    providerMemberId: uuid("provider_member_id")
      .notNull()
      .references(() => providerMember.id),

    // The slot.
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /**
     * Which of the member's concurrent slots this booking occupies, from 1.
     * `member_availability.capacity` (null meaning one) is how many a member
     * can hold at once for a given window — a room, a class, a team behind
     * one name, not only ever one customer at a time. This is an assignment,
     * not a fact about what was bought: unlike every other column in this
     * table's snapshot, it is never shown to a customer or a provider and
     * never travels through `bookingReadModel`, an event payload, or the
     * GraphQL schema. It exists only so `booking_member_slot_no_overlap`
     * below has something to key on besides the member and the time. At
     * capacity 1 every booking is seat 1 and the constraint behaves exactly
     * as it did before this column existed.
     */
    seat: integer("seat").notNull().default(1),

    // State: which status is current, and when each transition happened.
    status: text("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    markedDoneAt: timestamp("marked_done_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),

    // The money snapshot.
    priceMinor: integer("price_minor").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    commissionMinor: integer("commission_minor").notNull(),
    currency: text("currency").notNull().default("MZN"),

    // The rest of the snapshot: what was bought, from whom, and where.
    serviceName: text("service_name").notNull(),
    providerName: text("provider_name").notNull(),
    providerSlug: text("provider_slug").notNull(),
    optionName: text("option_name").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    addressLabel: text("address_label").notNull(),
    addressLine: text("address_line").notNull(),
    addressCity: text("address_city").notNull(),
    addressDistrict: text("address_district"),
    addressDirections: text("address_directions"),
    /** Text, matching `address.schema.ts`'s own choice — see that file. */
    addressLat: text("address_lat"),
    addressLng: text("address_lng"),

    // Customer input.
    description: text("description"),

    // Payment linkage.
    paymentRef: text("payment_ref"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A member cannot be in two places at once. Enforced in the database
    // rather than by the command that checks availability first, because two
    // requests can both read "free" before either writes — and the loser of
    // that race must be told, not quietly double-booked.
    //
    // What used to live here was `booking_member_slot_active_uq`, a unique
    // index on `(provider_member_id, starts_at)`. It only ever caught two
    // bookings sharing an exact start instant — a 90-minute booking at 14:00
    // and a 30-minute one at 14:30 both inserted, and 14:30 is a grid start
    // the availability modal legitimately offers (`slot_interval_minutes` is
    // 30). It is replaced by `booking_member_slot_no_overlap`, an
    // `EXCLUDE USING gist (provider_member_id WITH =, seat WITH =,
    // tstzrange(starts_at, ends_at) WITH &&)` constraint hand-added to the
    // migration — Drizzle has no builder for `EXCLUDE`, so it cannot be
    // declared here and will not show up in a `generate` diff. It subsumes
    // the old index rather than sitting alongside it: an identical start is a
    // degenerate case of two ranges overlapping, so nothing the unique index
    // refused escapes this one, and keeping both would leave two constraints
    // that can only disagree by one of them being wrong.
    //
    // `seat` joined the key after the constraint's first version refused
    // *any* two overlapping bookings on one member, which is right at
    // capacity 1 and wrong for a member who legitimately holds several at
    // once — `member_availability.capacity` is a real, already-honoured
    // column with nothing in the database backing it above 1. With `seat`
    // in the key, two bookings overlap only if they also share a seat; at
    // capacity 1 every booking is seat 1 and the guarantee is unchanged.
    //
    // Its `WHERE` clause is the same partial condition the old index used —
    // only statuses that still hold the slot; an expired or declined booking
    // releases the time — but, unlike this file's other predicates, it is
    // *not* built from `SLOT_HOLDING_STATUSES` through `statusList`, because
    // a hand-written migration statement cannot import a TypeScript
    // constant. A status added to `SLOT_HOLDING_STATUSES` does not
    // automatically reach it; see that constant's own comment.
    //
    // `booking.repository.ts`'s `isSlotCollision` still recognizes the old
    // index's SQLSTATE (`23505`) and name alongside the new constraint's
    // (`23P01`, `booking_member_slot_no_overlap`): migrations here are
    // applied by hand per stage, so this code can deploy before the
    // migration that drops the old index runs, and the live database keeps
    // raising the old error until it does.

    // A provider's dashboard reads "my bookings in status X" — pending
    // payments to chase, confirmed jobs to prepare for, disputes to answer.
    index("booking_provider_status_idx").on(t.providerId, t.status),

    // The sweep (`findDueForSweep`) runs
    // `WHERE status IN (…) AND expires_at <= now() ORDER BY expires_at ASC
    // LIMIT 200` every sixty seconds, forever, on a Worker's single
    // connection to Neon. `booking_provider_status_idx`'s leading column is
    // `provider_id`, so it cannot serve this — every sweep was a sequential
    // scan plus a sort of the whole table. Partial on the same statuses that
    // query filters to, so the predicate implies the query's and the index
    // also hands back rows pre-sorted for `ORDER BY expires_at ASC LIMIT 200`.
    //
    // **The predicate widened from `PENDING_PAYMENT` alone to all three
    // `DEADLINE_BEARING_STATUSES`** when the sweep did. A partial index whose
    // predicate does not imply the query's is simply not used, so leaving
    // this at one status would not have broken anything — it would have
    // silently put the sweep back to the sequential scan this index was
    // added to remove. **Nothing goes red for that**, which is exactly why
    // `booking-constraints.test.ts` reads this predicate back out of
    // `pg_indexes` and compares it to `DEADLINE_BEARING_STATUSES` in both
    // directions: an unapplied migration here is invisible without it.
    //
    // Built from the constant through `statusList`, unlike the exclusion
    // constraint's hand-typed predicate — Drizzle can express a partial
    // index, so this one cannot drift from the list it is generated from.
    // The catalogue test still earns its keep: it proves the *live database*
    // agrees with what this file generates, which is a different claim.
    index("booking_expiry_sweep_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} in (${statusList(DEADLINE_BEARING_STATUSES)})`),

    // `booking.mine` (`DrizzleBookingReadRepository.listForCustomer`) runs
    // `WHERE customer_id = $1 ORDER BY created_at DESC` with no index to
    // serve it either. Ordered `desc` to match the query directly rather
    // than relying on a backward index scan.
    index("booking_customer_created_idx").on(t.customerId, t.createdAt.desc()),

    check("booking_status_known", sql`${t.status} in (${statusList(BOOKING_STATUSES)})`),
    check("booking_price_minor_non_negative", sql`${t.priceMinor} >= 0`),
    check(
      "booking_commission_bps_range",
      sql`${t.commissionBps} BETWEEN 0 AND 10000`,
    ),
    check(
      "booking_commission_minor_non_negative",
      sql`${t.commissionMinor} >= 0`,
    ),
  ],
);

export type BookingRow = typeof booking.$inferSelect;
export type NewBookingRow = typeof booking.$inferInsert;
