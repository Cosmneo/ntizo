import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";

export const bookingSchema = pgSchema("ntizo_booking");

// Placeholder booking table — will be expanded per REQUIREMENTS v3.1
// (booking_path, service_location, staff_member_id, etc).
export const booking = bookingSchema.table("booking", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: text("customer_id")
    .notNull()
    .references(() => user.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BookingRow = typeof booking.$inferSelect;
export type NewBookingRow = typeof booking.$inferInsert;
