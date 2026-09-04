import { check, index, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communicationSchema, thread } from "./thread.schema";
import { user } from "../../user/schemas/user.schema";
import { booking } from "../../booking/schemas/booking.schema";

/**
 * The lifecycle of a support request — 1:1 with a `thread` of
 * `type = 'support'`, which holds the conversation itself.
 *
 * A second table rather than four nullable columns on `thread`: the thread
 * keeps what every conversation has; subject, status and resolution are
 * support's alone and live under support's name. Inquiries do not grow null
 * columns, and phase-1 code changes only where `provider_id` and
 * `sender_side` force it.
 *
 * `audience` is redundant with `thread.provider_id IS NULL` and kept anyway:
 * a query filtering the admin queue by audience should not have to know that
 * rule.
 */
export const supportRequest = communicationSchema.table(
  "support_request",
  {
    threadId: uuid("thread_id")
      .primaryKey()
      .references(() => thread.id, { onDelete: "cascade" }),
    audience: varchar("audience", { length: 16 }).notNull(),
    subject: varchar("subject", { length: 120 }).notNull(),
    bookingId: uuid("booking_id").references(() => booking.id),
    /**
     * What this request is. A dispute is the thread behind a booking sitting
     * at `DISPUTED`, waiting on an administrator's decision; an ordinary
     * request is a question. The difference is a column rather than an
     * inference from "has a booking id", which would break the first time
     * somebody asks a normal question about a booking they are disputing.
     *
     * **Resolving this row moves no booking**, and neither kind is an
     * exception to that. The decision that ends a dispute is
     * `bookingResolveDispute`, on the other side of the context boundary, and
     * the split is deliberate — see `resolve-booking-dispute.command.ts`. So
     * an administrator who resolves a dispute thread here has closed the
     * conversation and left the booking where it was. Nothing on the support
     * screens says so today, because no read model publishes this column:
     * follow-up #180.
     */
    kind: varchar("kind", { length: 16 }).notNull().default("support"),
    status: varchar("status", { length: 16 }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("support_request_audience_known", sql`${t.audience} in ('customer', 'provider')`),
    check("support_request_kind_known", sql`${t.kind} in ('support', 'dispute')`),
    check("support_request_status_known", sql`${t.status} in ('open', 'resolved')`),
    // `open` ⇔ not resolved. A row that says one and carries the other is a
    // bug, and the database is the one place that can refuse it every time.
    check("support_request_resolved_consistent", sql`(${t.status} = 'open') = (${t.resolvedAt} IS NULL)`),
    // Serves `countOpen` and the admin queue's `status` / `audience` filters —
    // not the queue's ordering, which is the thread's `last_message_at`, a
    // column this table doesn't have.
    index("idx_support_request_status_created").on(t.status, t.createdAt.desc(), t.threadId.desc()),
  ],
);

export type SupportRequestRow = typeof supportRequest.$inferSelect;
export type NewSupportRequestRow = typeof supportRequest.$inferInsert;
