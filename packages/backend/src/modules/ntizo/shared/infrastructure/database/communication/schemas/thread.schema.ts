import { check, index, pgSchema, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas/provider.schema";

export const communicationSchema = pgSchema("ntizo_communication");

/**
 * One conversation — a customer with a provider (inquiry), or somebody with
 * the platform (support).
 *
 * `last_message_at` is denormalised so an inbox can order and page without
 * touching `message`. It is written in the same transaction as the message.
 */
export const thread = communicationSchema.table(
  "thread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 32 }).notNull(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => user.id),
    // Nullable since phase 2: a personal support request has no provider to
    // point at. An inquiry still always has one — `thread_inquiry_has_provider`
    // below is what lets phase-1 code keep trusting that. A nullable column
    // rather than a sentinel "platform" provider row: DoAzores used an
    // all-zeros workspace id for exactly this and paid for it with
    // short-circuits in two places, one of them a bug found later.
    providerId: uuid("provider_id").references(() => provider.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Partial on purpose: a phase-2 support thread carries a different `type`,
    // and Postgres treats NULLs as distinct — a plain unique index would stop
    // constraining anything the moment a column here can be null.
    uniqueIndex("thread_customer_provider_uq")
      .on(t.customerUserId, t.providerId)
      .where(sql`${t.type} = 'inquiry'`),
    index("idx_thread_customer_recent").on(t.customerUserId, t.lastMessageAt.desc(), t.id.desc()),
    index("idx_thread_provider_recent").on(t.providerId, t.lastMessageAt.desc(), t.id.desc()),
    check("thread_type_known", sql`${t.type} in ('inquiry', 'support')`),
    check("thread_inquiry_has_provider", sql`${t.type} <> 'inquiry' OR ${t.providerId} IS NOT NULL`),
  ],
);

export type ThreadRow = typeof thread.$inferSelect;
export type NewThreadRow = typeof thread.$inferInsert;
