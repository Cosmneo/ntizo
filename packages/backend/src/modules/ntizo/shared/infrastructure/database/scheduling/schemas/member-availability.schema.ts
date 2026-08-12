import { check, index, integer, pgSchema, smallint, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { provider, providerMember } from "../../provider/schemas";

export const schedulingSchema = pgSchema("ntizo_scheduling");

/**
 * One contiguous stretch a member works on one weekday.
 *
 * Minutes from local midnight rather than `time`: the engine does arithmetic
 * in minutes and would otherwise cast on every read, and `time` cannot say
 * `24:00` — a shop closing at midnight would have no way to write it.
 *
 * `provider_id` is denormalised so authorisation never joins to find it.
 *
 * Overlapping rows carry no constraint. 08:00-12:00 beside 11:00-14:00 means
 * 08:00-14:00; the engine merges them and nothing is corrupted. The form is
 * what refuses to create one.
 */
export const memberAvailability = schedulingSchema.table(
  "member_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => providerMember.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday, matching `Date#getUTCDay`. */
    weekday: smallint("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("member_availability_member_weekday_idx").on(t.memberId, t.weekday),
    check("member_availability_weekday_range", sql`${t.weekday} BETWEEN 0 AND 6`),
    check(
      "member_availability_minutes",
      sql`${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.endMinute} > ${t.startMinute}`,
    ),
  ],
);

export type MemberAvailabilityRecord = typeof memberAvailability.$inferSelect;
