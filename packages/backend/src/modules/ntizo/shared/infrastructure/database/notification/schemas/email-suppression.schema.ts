import { jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const notificationSchema = pgSchema("ntizo_notification");

/**
 * Addresses this platform must stop writing to.
 *
 * **Keyed by the address itself, not a surrogate id.** There is exactly one
 * answer to "may we write here", the question is always asked by address, and
 * a unique index over a generated key is the same thing with an extra hop.
 *
 * There is no un-suppression path and that is deliberate: removing a row is a
 * manual database operation until somebody needs it more often than that.
 * Building a UI for it first would be building the rare case.
 *
 * `detail` keeps the provider's own event body. A bounce is the kind of thing
 * somebody investigates months later, and the reason Resend gave is the only
 * evidence that survives.
 */
export const emailSuppression = notificationSchema.table(
  "email_suppression",
  {
    email: text("email").primaryKey(),
    reason: text("reason").notNull(),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }).notNull().defaultNow(),
    detail: jsonb("detail"),
  },
  (t) => [
    check("email_suppression_reason_known", sql`${t.reason} IN ('bounce', 'complaint')`),
  ],
);

export type EmailSuppressionRecord = typeof emailSuppression.$inferSelect;
