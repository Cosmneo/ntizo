import { check, date, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { provider, providerMember } from "../../provider/schemas";
import { schedulingSchema } from "./member-availability.schema";

/**
 * One member, one date. Either `closed` — not working — or `custom`, which
 * replaces that day's weekly pattern outright.
 *
 * No uniqueness on (member, date): several `custom` rows on one date merge,
 * and that is how "Saturday I work the morning and the late afternoon" is
 * written. A `closed` row on the same date beats all of them.
 */
export const dateException = schedulingSchema.table(
  "date_exception",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => providerMember.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    /** "closed" | "custom" */
    kind: text("kind").notNull(),
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("date_exception_member_date_idx").on(t.memberId, t.onDate),
    check(
      "date_exception_shape",
      sql`(${t.kind} = 'closed' AND ${t.startMinute} IS NULL AND ${t.endMinute} IS NULL)
       OR (${t.kind} = 'custom' AND ${t.startMinute} IS NOT NULL AND ${t.endMinute} IS NOT NULL
           AND ${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.endMinute} > ${t.startMinute})`,
    ),
  ],
);

export type DateExceptionRecord = typeof dateException.$inferSelect;
