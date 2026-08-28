import { index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { communicationSchema } from "./thread.schema";
import { message } from "./message.schema";

/**
 * A file sent with a message.
 *
 * No `uploader_id`: whoever uploaded is whoever sent the message, and
 * duplicating that invites the two to disagree.
 */
export const attachment = communicationSchema.table(
  "attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_attachment_message").on(t.messageId)],
);

export type AttachmentRow = typeof attachment.$inferSelect;
export type NewAttachmentRow = typeof attachment.$inferInsert;
