import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas/provider.schema";
import { providerMember } from "../../provider/schemas/provider-member.schema";
import { service, serviceOption } from "../../catalog/schemas/service.schema";
import { BOOKING_STATUSES, SLOT_HOLDING_STATUSES } from "../enums";

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
 * compile-time enum defined in this repository — `BOOKING_STATUSES` and
 * `SLOT_HOLDING_STATUSES` from `../enums` — never user input, and nothing
 * else calls this function. The point of building the list from that constant
 * at all (rather than typing the statuses out by hand) is unchanged from
 * `inArray`'s original purpose: one list, read by both the TypeScript union
 * and the database constraint, not two that agree only by transcription and
 * can silently drift apart.
 */
const statusList = (values: readonly string[]) =>
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
    // Partial: only statuses that still hold the slot. An expired or declined
    // booking releases the time, and a provider who cannot rebook a slot that
    // nobody holds would rightly call that a bug. Built from
    // `SLOT_HOLDING_STATUSES` through `statusList` (see its doc comment above
    // for why that helper exists, and not `inArray`) rather than a
    // hand-written SQL list of the same four strings, so there is one list
    // this index and the rest of the domain both read — a status added to the
    // constant without being added here is the bug this exists to prevent,
    // not to repeat.
    uniqueIndex("booking_member_slot_active_uq")
      .on(t.providerMemberId, t.startsAt)
      .where(sql`${t.status} in (${statusList(SLOT_HOLDING_STATUSES)})`),

    // A provider's dashboard reads "my bookings in status X" — pending
    // payments to chase, confirmed jobs to prepare for, disputes to answer.
    index("booking_provider_status_idx").on(t.providerId, t.status),

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
