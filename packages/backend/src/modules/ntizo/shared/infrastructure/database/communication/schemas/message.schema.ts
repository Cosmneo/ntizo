import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communicationSchema, thread } from "./thread.schema";
import { user } from "../../user/schemas/user.schema";

/**
 * `read_at` sits here rather than as a per-side cursor on the thread: each
 * message has exactly one recipient side, so "unread" is a direct count.
 *
 * `notify_due_at` / `notified_at` carry the delayed notice. Nothing is raised
 * when a message is sent; the sweep raises it only if the message is still
 * unread when the window elapses, so a fast exchange produces no email at all.
 */
export const message = communicationSchema.table(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => thread.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    notifyDueAt: timestamp("notify_due_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_message_thread_recent").on(t.threadId, t.createdAt.desc(), t.id.desc()),
    // The only rows the sweep wants. Partial so the index stays small however
    // many messages exist.
    index("idx_message_notify_due")
      .on(t.notifyDueAt)
      .where(sql`${t.notifyDueAt} IS NOT NULL AND ${t.readAt} IS NULL AND ${t.notifiedAt} IS NULL`),
  ],
);

export type MessageRow = typeof message.$inferSelect;
export type NewMessageRow = typeof message.$inferInsert;
