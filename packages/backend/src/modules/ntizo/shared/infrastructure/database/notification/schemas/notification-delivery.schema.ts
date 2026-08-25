import { index, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { notification } from "./notification.schema";

const notificationSchema = pgSchema("ntizo_notification");

/**
 * One outbound attempt.
 *
 * **A delivery is not a notification, and `notification_id` is nullable for a
 * reason that took a whole design round to surface.** A team invitation goes
 * to an email address that may belong to nobody yet — there is no inbox to
 * address, but there is certainly a message to send. So a delivery carries its
 * own `type` and `locale` and can be rendered without an inbox row behind it.
 *
 * **The row is written BEFORE the attempt, not after.** Writing it after would
 * mean an isolate dying mid-send leaves no trace of an email that may well have
 * gone out — which is the exact case an audit exists for. A row stuck at
 * `queued` is a queryable symptom; no row at all is not.
 *
 * `notification_id` does NOT cascade. A delivery is the record of something
 * that actually left the building, and it must outlive the inbox item it was
 * about — including when that item is deleted with its addressee.
 */
export const notificationDelivery = notificationSchema.table(
  "notification_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id").references(() => notification.id, {
      onDelete: "set null",
    }),
    /** A `NotificationType` value — carried so a delivery renders without a notification. */
    type: text("type").notNull(),
    /** Only "EMAIL" today. Present so adding a channel is a value, not a migration. */
    channel: text("channel").notNull(),
    toEmail: text("to_email").notNull(),
    /** The recipient's own language, resolved when the delivery was created. */
    locale: text("locale").notNull(),
    status: text("status").notNull(),
    /** Resend's own id, for correlating a bounce webhook back to this row. */
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "Did the invitation arrive?" is asked by address, and "what is stuck?" is
    // asked by status. Those are the only two questions this table answers.
    index("notification_delivery_email_idx").on(t.toEmail, t.createdAt.desc()),
    index("notification_delivery_status_idx").on(t.status),
    // Correlating a webhook back to its row is a lookup on this, and it is
    // sparse: only a successful send has one.
    index("notification_delivery_message_idx")
      .on(t.providerMessageId)
      .where(sql`${t.providerMessageId} IS NOT NULL`),
    check(
      "notification_delivery_status_known",
      sql`${t.status} IN ('queued', 'sent', 'failed', 'suppressed')`,
    ),
    check("notification_delivery_channel_known", sql`${t.channel} IN ('EMAIL')`),
  ],
);

export type NotificationDeliveryRecord = typeof notificationDelivery.$inferSelect;
export type NewNotificationDeliveryRecord = typeof notificationDelivery.$inferInsert;
