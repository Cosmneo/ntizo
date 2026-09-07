import { sql } from "drizzle-orm";
import { check, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { quote, quoteSchema } from "./quote.schema";
import { quoteProposal } from "./quote-proposal.schema";

/** A file sent with one step of the quote. Same bucket and limits as message attachments. */
export const quoteAttachment = quoteSchema.table(
  "quote_attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").references(() => quoteProposal.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("quote_attachment_step_known", sql`${t.step} in ('request', 'proposal', 'closing')`),
    check(
      "quote_attachment_proposal_step",
      sql`(${t.step} = 'proposal') = (${t.proposalId} IS NOT NULL)`,
    ),
    index("quote_attachment_quote_idx").on(t.quoteId),
  ],
);

export type QuoteAttachmentRow = typeof quoteAttachment.$inferSelect;
export type NewQuoteAttachmentRow = typeof quoteAttachment.$inferInsert;
