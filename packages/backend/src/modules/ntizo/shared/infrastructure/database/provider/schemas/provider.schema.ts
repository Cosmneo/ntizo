import {
  doublePrecision,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";

export const providerSchema = pgSchema("ntizo_provider");

// Provider table — represents either an individual provider (a person) or an
// organization-type provider (an establishment with multiple staff).
// Mirrors the Provider aggregate in the provider BC.
export const provider = providerSchema.table("provider", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id),
  type: text("type").notNull(), // "individual" | "organization"
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("pending"),
  description: text("description"),

  // Embedded Address VO
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressDistrict: text("address_district"),
  addressCountry: text("address_country"),
  addressPostalCode: text("address_postal_code"),
  addressLat: doublePrecision("address_lat"),
  addressLng: doublePrecision("address_lng"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ProviderRow = typeof provider.$inferSelect;
export type NewProviderRow = typeof provider.$inferInsert;
