import { foreignKey, index, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { favouriteList, favouriteSchema } from "./favourite-list.schema";

/**
 * One listing filed into one list.
 *
 * **No foreign key to the target.** A service belongs to Catalog and a provider
 * to Provider; a favourite must not reach across a bounded-context boundary at
 * the database level. A row pointing at something deleted, unpublished, or
 * belonging to a suspended provider is resolved away on read — the same rule
 * both listings already apply to their own rows, so this adds no new behaviour
 * to reason about.
 *
 * `user_id` is here as well as on the list, and the composite foreign key
 * below is why that is safe. The hearts query — "which of these twenty-four
 * listings has this person saved anywhere" — runs on every render of a listing
 * page for a signed-in reader, and routing it through `favourite_list` puts a
 * join on the hottest read in the feature. Denormalising is normally two
 * sources of truth that will one day disagree; this one cannot, because the
 * database refuses a row whose owner is not its list's owner.
 */
export const favourite = favouriteSchema.table(
  "favourite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id").notNull(),
    userId: text("user_id").notNull(),
    /** `service` or `provider`. Kept short — see `FAVOURITE_TARGETS`. */
    targetType: varchar("target_type", { length: 16 }).notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.listId, t.userId],
      foreignColumns: [favouriteList.id, favouriteList.userId],
      name: "favourite_list_owner_fk",
    }).onDelete("cascade"),
    /*
     * Scoped to the list, never to the person: the same listing in two lists
     * is the feature. What this forbids is the same listing twice in ONE
     * list, which a double-tap would otherwise write and no count would ever
     * recover from.
     */
    unique("favourite_list_target_uq").on(t.listId, t.targetType, t.targetId),
    index("favourite_list_created_idx").on(t.listId, t.createdAt.desc()),
    index("favourite_user_target_idx").on(t.userId, t.targetType, t.targetId),
  ],
);

export type FavouriteRow = typeof favourite.$inferSelect;
export type NewFavouriteRow = typeof favourite.$inferInsert;
