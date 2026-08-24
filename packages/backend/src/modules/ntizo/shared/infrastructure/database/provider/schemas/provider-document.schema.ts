import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { providerSchema } from "./provider.schema";
import { provider } from "./provider.schema";
import { user } from "../../user/schemas/user.schema";

/**
 * Identity and compliance documents — append-only, one row per upload.
 *
 * The shape exists to answer one question honestly: *what was actually
 * approved?* A single mutable `documents` column cannot. Approve a real ID,
 * then overwrite the file, and the record still reads "approved" against
 * something no human ever looked at. Nothing about that is exotic; it is the
 * obvious move for anyone who wants a verified badge without being verified.
 *
 * So a row is written once and never edited. Replacing a document does not
 * touch the old row — it inserts a new one, `pending`, and points
 * `supersedesId` at what it replaces. The approved row stays exactly as the
 * reviewer left it, which means:
 *
 *   - an approval can never migrate onto bytes that arrived after it;
 *   - a swap is not a silent overwrite but a new pending item in the queue;
 *   - "this provider changed their ID two days after being approved" is a
 *     question the table can answer, rather than a fact it has erased.
 *
 * The storage key is immutable too — `documents.ts` mints one with a
 * timestamp per upload, so R2 never overwrites either. The two decisions have
 * to hold together: an append-only table over mutable object keys would prove
 * nothing.
 */
export const providerDocument = providerSchema.table(
  "provider_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),

    /** A `ProviderDocumentType`. Text, like every other enum in this schema. */
    type: text("type").notNull(),

    /** Immutable. Never reused, never overwritten. */
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name"),
    contentType: text("content_type"),

    /** `pending` | `approved` | `rejected` | `superseded`. */
    status: text("status").notNull().default("pending"),

    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    /**
     * Who decided, and when. Null while pending — and null forever on a row
     * that was superseded before anyone got to it, which is itself worth being
     * able to see.
     */
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Shown to the provider, so it has to say something they can act on. */
    rejectionReason: text("rejection_reason"),

    /**
     * The row this one replaces, if any.
     *
     * Self-referential and nullable: the first upload of a type replaces
     * nothing. Following the chain backwards gives the full history of what a
     * provider has claimed, in order.
     */
    supersedesId: uuid("supersedes_id"),
  },
  (table) => [
    // The settings page and the admin queue both read "this provider's
    // documents, newest first".
    index("provider_document_provider_idx").on(table.providerId, table.uploadedAt),
    // The queue reads "everything still waiting", across all providers.
    index("provider_document_status_idx").on(table.status, table.uploadedAt),
  ],
);
