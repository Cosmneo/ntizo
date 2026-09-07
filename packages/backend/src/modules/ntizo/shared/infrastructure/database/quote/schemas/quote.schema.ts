import { sql } from "drizzle-orm";
import { check, date, index, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas/provider.schema";
import { service } from "../../catalog/schemas/service.schema";
import { thread } from "../../communication/schemas/thread.schema";
import { QUOTE_DEADLINE_BEARING_STATUSES, QUOTE_STATUS_VALUES, type QuoteStatus } from "../enums";

export const quoteSchema = pgSchema("ntizo_quote");

const statusList = (values: readonly QuoteStatus[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

export const quote = quoteSchema.table(
  "quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    serviceId: uuid("service_id").notNull().references(() => service.id),
    providerId: uuid("provider_id").notNull().references(() => provider.id),
    customerId: text("customer_id").notNull().references(() => user.id),
    /** The pair's conversation, created or reused when the request is sent. */
    threadId: uuid("thread_id").notNull().references(() => thread.id),

    status: text("status").notNull(),
    /** Whichever clock the status stands on; NULL once terminal. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** The locale the customer requested in; the booking's service-name snapshot is taken in it. */
    locale: text("locale").notNull(),

    // The request.
    description: text("description").notNull(),
    neededBy: date("needed_by"),
    addressLabel: text("address_label"),
    addressLine: text("address_line"),
    addressCity: text("address_city"),
    addressDistrict: text("address_district"),
    addressDirections: text("address_directions"),
    addressLat: text("address_lat"),
    addressLng: text("address_lng"),

    // The close.
    closedReason: text("closed_reason"),
    closedNote: text("closed_note"),
    closedByUserId: text("closed_by_user_id").references(() => user.id),
    expiredCause: text("expired_cause"),
    /**
     * Set at ACCEPTED, in the same transaction that inserts the booking. Not a
     * foreign key: `booking.quote_id` is the enforced link (it references this
     * table), and declaring both would make the two schema files import each
     * other.
     */
    bookingId: uuid("booking_id"),

    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("quote_status_known", sql`${t.status} in (${statusList(QUOTE_STATUS_VALUES)})`),
    check(
      "quote_expired_cause_known",
      sql`${t.expiredCause} IS NULL OR ${t.expiredCause} in ('provider_did_not_respond', 'proposal_lapsed')`,
    ),
    // One open quote per customer and service — the mirror of checkout's one-open-draft rule.
    uniqueIndex("quote_open_per_customer_service_uq")
      .on(t.customerId, t.serviceId)
      .where(sql`${t.status} in ('REQUESTED', 'PROPOSED')`),
    index("quote_customer_recent_idx").on(t.customerId, t.createdAt.desc(), t.id.desc()),
    index("quote_provider_status_idx").on(t.providerId, t.status, t.expiresAt),
    // The sweep: predicate generated from the constant, proven live by quote-constraints.test.ts.
    index("quote_sweep_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} in (${statusList(QUOTE_DEADLINE_BEARING_STATUSES)})`),
  ],
);

export type QuoteRow = typeof quote.$inferSelect;
export type NewQuoteRow = typeof quote.$inferInsert;
