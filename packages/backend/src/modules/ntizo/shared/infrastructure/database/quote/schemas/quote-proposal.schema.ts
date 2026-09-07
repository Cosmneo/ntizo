import { sql } from "drizzle-orm";
import { check, index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";
import { providerMember } from "../../provider/schemas/provider-member.schema";
import { quote, quoteSchema } from "./quote.schema";

export const quoteProposal = quoteSchema.table(
  "quote_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),

    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("MZN"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    /** starts_at + duration; stored so the overlap read never recomputes it. */
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    providerMemberId: uuid("provider_member_id")
      .notNull()
      .references(() => providerMember.id),
    note: text("note"),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),

    /** NULL on the live proposal; stamped when a revision or a taken slot replaces it. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededCause: text("superseded_cause"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("quote_proposal_price_positive", sql`${t.priceMinor} > 0`),
    check("quote_proposal_duration_positive", sql`${t.durationMinutes} > 0`),
    check(
      "quote_proposal_superseded_cause_known",
      sql`${t.supersededCause} IS NULL OR ${t.supersededCause} in ('revised', 'slot_taken')`,
    ),
    // One live proposal per quote.
    uniqueIndex("quote_proposal_live_uq").on(t.quoteId).where(sql`${t.supersededAt} IS NULL`),
    index("quote_proposal_quote_recent_idx").on(t.quoteId, t.createdAt.desc()),
  ],
);

export type QuoteProposalRow = typeof quoteProposal.$inferSelect;
export type NewQuoteProposalRow = typeof quoteProposal.$inferInsert;
