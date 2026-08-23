import { check, index, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas";

export const notificationSchema = pgSchema("ntizo_notification");

/**
 * One item in somebody's inbox.
 *
 * **Addressed to exactly one party, and the database enforces which.** A row
 * where `audience` and the two id columns disagree is a notification addressed
 * to nobody or to two people at once; `num_nonnulls` makes that
 * unrepresentable rather than merely discouraged by a command.
 *
 * `userId` is `text` because better-auth issues string ids and
 * `ntizo_user.user.id` is a text column — `review.author_user_id` already
 * references it the same way. `providerId` is a real `uuid`. The two are not
 * interchangeable and a uuid column pointing at a better-auth id fails on the
 * first insert.
 *
 * **`payload` is a snapshot, not a set of foreign keys.** "Salão X has been
 * verified" must still say X after X is renamed, deactivated or deleted.
 * Resolving names at read time makes an inbox that rewrites its own history and
 * ties every row to the lifetime of everything it mentions.
 *
 * Deleting the addressee takes their inbox with it — for a person because
 * "delete my data" has to mean that, for a business because a workspace inbox
 * without a workspace is about nothing.
 */
export const notification = notificationSchema.table(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** A `NotificationType` value from `@ntizo/shared`. */
    type: text("type").notNull(),
    /** "user" | "provider" — which of the two id columns is the addressee. */
    audience: text("audience").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => provider.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Both inboxes are read as "this addressee's rows, newest first", which is
    // this pair of indexes. Partial, because half the rows have a null in each.
    index("notification_user_idx").on(t.userId, t.createdAt.desc()),
    index("notification_provider_idx").on(t.providerId, t.createdAt.desc()),
    check("notification_audience_known", sql`${t.audience} IN ('user', 'provider')`),
    check(
      "notification_one_addressee",
      sql`num_nonnulls(${t.userId}, ${t.providerId}) = 1`,
    ),
    // The audience column and the populated id must agree. Without this the
    // CHECK above still passes for a row claiming audience='user' while
    // carrying only a provider_id, and every reader would then have to guess
    // which of the two to believe.
    check(
      "notification_audience_matches_addressee",
      sql`(${t.audience} = 'user' AND ${t.userId} IS NOT NULL)
          OR (${t.audience} = 'provider' AND ${t.providerId} IS NOT NULL)`,
    ),
  ],
);

export type NotificationRecord = typeof notification.$inferSelect;
export type NewNotificationRecord = typeof notification.$inferInsert;
