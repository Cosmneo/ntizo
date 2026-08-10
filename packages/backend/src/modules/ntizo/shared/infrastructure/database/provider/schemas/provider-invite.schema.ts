import { text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { provider, providerSchema } from "./provider.schema";

// provider_invite — pending email invitations to join an organization-type provider.
export const providerInvite = providerSchema.table(
  "provider_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(), // "admin" | "staff"
    token: text("token").notNull().unique(),
    /**
   * Who sent it.
   *
   * Absent until now, which meant the accept page had to name the workspace
   * *owner* as the inviter — wrong every time an admin does the inviting, and
   * the email already knew the right answer because it addresses the invitee
   * by the sender's name. Nullable for rows written before this column
   * existed; the page falls back to the workspace name for those.
   */
  invitedByUserId: text("invited_by_user_id"),

  status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqProviderEmail: uniqueIndex("provider_invite_provider_email_uniq").on(
      t.providerId,
      t.email,
    ),
  }),
);

export type ProviderInviteRow = typeof providerInvite.$inferSelect;
export type NewProviderInviteRow = typeof providerInvite.$inferInsert;
