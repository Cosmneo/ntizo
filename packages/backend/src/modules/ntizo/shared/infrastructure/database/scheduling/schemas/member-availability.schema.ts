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
    /**
     * The three that shape the slots this window produces. All nullable, and
     * that is the design: `NULL` means "use the default", which is what the
     * `Use default: …` placeholder on the rule drawer says out loud.
     *
     * `slotIntervalMinutes` has three states, not two. `NULL` is "nothing
     * said". `0` is **"said: no slots"** — the window is simply open, for a
     * provider who takes people as they arrive. `15`/`30`/`60` is a grid.
     * Spelled as a value rather than a separate `slotted` boolean because a
     * boolean plus a number can contradict each other, and
     * `slotted = false, interval = 30` would still be storable.
     */
    bufferMinutes: integer("buffer_minutes"),
    slotIntervalMinutes: integer("slot_interval_minutes"),
    /** How many bookings one slot holds. Null → 1: one barber cuts one head. */
    capacity: integer("capacity"),
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
    check(
      "member_availability_buffer_range",
      sql`${t.bufferMinutes} IS NULL OR ${t.bufferMinutes} BETWEEN 0 AND 480`,
    ),
    check(
      "member_availability_slot_interval",
      sql`${t.slotIntervalMinutes} IS NULL OR ${t.slotIntervalMinutes} IN (0, 15, 30, 60)`,
    ),
    check("member_availability_capacity", sql`${t.capacity} IS NULL OR ${t.capacity} >= 1`),
  ],
);

export type MemberAvailabilityRecord = typeof memberAvailability.$inferSelect;
