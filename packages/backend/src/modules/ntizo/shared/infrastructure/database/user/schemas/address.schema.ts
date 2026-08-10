import { boolean, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user, userSchema } from "./user.schema";

/**
 * A customer's saved addresses. Many per user, unlike the profile.
 *
 * Its own table rather than columns on the profile: a person has a home and a
 * workplace, and a booking has to say which one. Flattening them onto the
 * profile would mean one address per person and a second booking to a
 * different place overwriting the first.
 *
 * Separate from the provider's address, which lives inline on `provider`. That
 * one is a business location shown publicly; these are private, and the two
 * have no reason to share a lifecycle.
 */
export const address = userSchema.table(
  "address",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** What the user calls it — "Casa", "Escritório". Theirs to choose. */
    label: text("label").notNull(),

    /**
     * ISO 3166-1 alpha-2. Two letters, not a name: names are translated and
     * change, and the country decides which of the fields below are asked for.
     */
    country: text("country").notNull(),
    city: text("city").notNull(),
    /** Bairro, freguesia, neighbourhood — whatever the country's second level is. */
    district: text("district"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    postalCode: text("postal_code"),

    /**
     * Free text for the last hundred metres.
     *
     * Not decoration in Mozambique: many addresses are not on a numbered
     * street, and "casa azul depois da bomba da Petromoc" is how a provider
     * actually arrives. A structured address alone would make the platform
     * unusable in the market it launches in.
     */
    directions: text("directions"),

    /**
     * Coordinates, when the user drops a pin. Nullable because typing an
     * address must not require one.
     */
    latitude: text("latitude"),
    longitude: text("longitude"),

    /**
     * At most one per user, enforced in the aggregate rather than by a partial
     * unique index: setting a new default has to clear the old one in the same
     * transaction, and an index would reject the write halfway through instead
     * of the code doing it in order.
     */
    isDefault: boolean("is_default").notNull().default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Every read is "this user's addresses"; nothing looks one up by id alone
    // without already knowing whose it is.
    index("address_user_id_idx").on(table.userId),
  ],
);
