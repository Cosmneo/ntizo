import { text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { provider, providerSchema } from "./provider.schema";
import { user } from "../../user/schemas/user.schema";

// provider_member — links users to providers with a role.
// Only meaningful for organization-type providers; individual providers
// implicitly have a single membership for the owner.
export const providerMember = providerSchema.table(
  "provider_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull(), // "owner" | "admin" | "staff"
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqProviderUser: uniqueIndex("provider_member_provider_user_uniq").on(
      t.providerId,
      t.userId,
    ),
  }),
);

export type ProviderMemberRow = typeof providerMember.$inferSelect;
export type NewProviderMemberRow = typeof providerMember.$inferInsert;
