import { date, text, timestamp } from "drizzle-orm/pg-core";
import type { Locale } from "@ntizo/shared";
import { user, userSchema } from "./user.schema";

// profile — extended, one row per user, FK to user.id.
export const profile = userSchema.table("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  phoneNumber: text("phone_number"),
  bio: text("bio"),
  language: text("language").$type<Locale>().notNull().default("en-US"),
  timezone: text("timezone").notNull().default("UTC"),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ProfileRow = typeof profile.$inferSelect;
export type NewProfileRow = typeof profile.$inferInsert;
