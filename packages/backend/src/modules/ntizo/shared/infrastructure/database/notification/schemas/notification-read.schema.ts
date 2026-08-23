import { pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { notification } from "./notification.schema";
import { user } from "../../user/schemas/user.schema";

const notificationSchema = pgSchema("ntizo_notification");

/**
 * Who has read what.
 *
 * **A table rather than a `read_at` column on `notification`.** A workspace
 * notification is read by each member independently; a column would report that
 * the whole business had read something the moment one member opened it. For a
 * personal notification only one row can ever exist, which is a small cost for
 * having one model instead of two.
 *
 * The composite primary key is also the idempotency rule: marking something
 * read twice is the same fact stated twice, and `ON CONFLICT DO NOTHING`
 * resolves on this key rather than on a read-then-write that two clicks can
 * both pass.
 */
export const notificationRead = notificationSchema.table(
  "notification_read",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export type NotificationReadRecord = typeof notificationRead.$inferSelect;
