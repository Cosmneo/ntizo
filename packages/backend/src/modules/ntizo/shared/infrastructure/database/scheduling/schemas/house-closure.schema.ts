import { check, date, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { provider } from "../../provider/schemas";
import { schedulingSchema } from "./member-availability.schema";

/**
 * A date range where nobody works. Christmas is one row and one gesture, not
 * seven rows per member. Both ends inclusive.
 */
export const houseClosure = schedulingSchema.table(
  "house_closure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("house_closure_provider_range_idx").on(t.providerId, t.fromDate, t.toDate),
    check("house_closure_range", sql`${t.toDate} >= ${t.fromDate}`),
  ],
);

export type HouseClosureRecord = typeof houseClosure.$inferSelect;
