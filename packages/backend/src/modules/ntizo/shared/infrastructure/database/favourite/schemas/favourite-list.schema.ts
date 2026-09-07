import { sql } from "drizzle-orm";
import { boolean, index, pgSchema, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const favouriteSchema = pgSchema("ntizo_favourite");

/**
 * A named collection of saved listings.
 *
 * Everybody gets one to begin with and can make more, and one listing can sit
 * in several at once — "Casa nova" and "Urgente" are both true about the same
 * electrician, and making somebody choose between them is making them lose one
 * of the two facts.
 */
export const favouriteList = favouriteSchema.table(
  "favourite_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * `text`, matching `activity.actor_user_id`: these ids come from
     * better-auth's own tables in a separate migration chain, and typing them
     * as `uuid` here would be this schema asserting something about a table it
     * does not own.
     */
    userId: text("user_id").notNull(),
    /**
     * NULL on the default list, and that is the whole mechanism.
     *
     * A null name means "render the translated default", so the same list
     * reads *Favoritos* to one person and *Favourites* to another. A stored
     * name would freeze it in whatever language the account was created in.
     * Renaming the default writes a name here and it stops being translated,
     * which is right: a list somebody named is theirs, not the platform's.
     */
    name: varchar("name", { length: 60 }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /*
     * Looks redundant beside the primary key and is not: a primary key on
     * `id` alone cannot be the target of the composite foreign key
     * `favourite` declares. This is what makes the denormalised owner over
     * there impossible to get wrong.
     */
    unique("favourite_list_id_user_uq").on(t.id, t.userId),
    /*
     * Case-insensitive, because "Casa nova" and "casa nova" are the same list
     * to the person who typed them and two identical rows in the dialog to
     * everybody else. A plain unique on `(user_id, name)` would let both
     * through.
     */
    uniqueIndex("favourite_list_user_name_uq").on(t.userId, sql`lower(${t.name})`),
    /*
     * Exactly one default per person. A partial unique index rather than a
     * check somewhere in the application: two tabs both creating a first list
     * would otherwise both succeed, and the heart would have two destinations.
     */
    uniqueIndex("favourite_list_one_default_uq")
      .on(t.userId)
      .where(sql`${t.isDefault}`),
    index("favourite_list_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);
