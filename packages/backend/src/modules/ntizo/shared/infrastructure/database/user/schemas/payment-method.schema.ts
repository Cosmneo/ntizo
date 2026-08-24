import { boolean, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { PaymentDirection, PaymentMethodType } from "@ntizo/shared";
import { user, userSchema } from "./user.schema";

/**
 * A saved payment instrument, in either direction.
 *
 * One table for both because the shape is identical — an owner, a type, an
 * identifier and a display label — and the difference is a value, not a
 * structure. `direction` says whether this is charged or credited; splitting
 * into two tables would duplicate every column to encode one boolean.
 *
 * Nothing sensitive is stored. `identifier` holds a phone number for mobile
 * money, a masked account number for a bank, or a processor token for a card:
 * the value a user needs to recognise which method is which, never a value
 * that can move money on its own.
 */
export const paymentMethod = userSchema.table(
  "payment_method",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    type: text("type").$type<PaymentMethodType>().notNull(),
    direction: text("direction").$type<PaymentDirection>().notNull(),

    /**
     * The country this method belongs to, ISO 3166-1 alpha-2.
     *
     * Stored on the row rather than derived from the user: someone may live in
     * one country and be paid in another, and the rules that validated this
     * identifier were the rules of the country it was created under.
     */
    country: text("country").notNull(),

    /**
     * Phone number, masked account number, or processor token — per type. The
     * only identifier the platform keeps.
     */
    identifier: text("identifier").notNull(),

    /** What the user calls it, or what we derived: "M-Pesa ···4455". */
    label: text("label").notNull(),

    isDefault: boolean("is_default").notNull().default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Reads are always "this user's methods, in this direction" — the account
    // page wants what they pay with, the payout settings what they are paid to.
    index("payment_method_user_direction_idx").on(table.userId, table.direction),
  ],
);

/**
 * Which payment types a country offers, and in which direction.
 *
 * Administrator-maintained data, deliberately not an enum. Mozambique offers
 * M-Pesa and e-Mola; Portugal offers bank transfer; adding Kenya is a row.
 * What is NOT a row is a payment type nobody has written the validation and
 * integration for — that is code, and the enum in `@ntizo/shared` is its list.
 */
export const countryPaymentMethod = userSchema.table(
  "country_payment_method",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    country: text("country").notNull(),
    type: text("type").$type<PaymentMethodType>().notNull(),
    direction: text("direction").$type<PaymentDirection>().notNull(),

    /**
     * Off rather than deleted when a country stops offering something.
     *
     * Deleting the row would orphan every saved method of that type with no
     * record of why, and a country that suspends a provider for a month would
     * lose the configuration rather than pause it.
     */
    isEnabled: boolean("is_enabled").notNull().default(true),

    /** Order shown in the picker. Lower first. */
    sortOrder: text("sort_order").notNull().default("0"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("country_payment_method_country_idx").on(table.country, table.direction),
  ],
);
