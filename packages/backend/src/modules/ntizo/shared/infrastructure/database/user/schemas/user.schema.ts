import { pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { UserRole, UserStatus, VerificationStatus } from "@ntizo/shared";

export const userSchema = pgSchema("ntizo_user");

// user — auth-linked, minimal. id == better_auth.user.id.
export const user = userSchema.table("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role").$type<UserRole>().notNull().default("customer"),
  status: text("status").$type<UserStatus>().notNull().default("active"),
  // Null = not a provider; a VerificationStatus once upgraded.
  verificationStatus: text("verification_status").$type<VerificationStatus>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type UserRow = typeof user.$inferSelect;
export type NewUserRow = typeof user.$inferInsert;
