import { pgSchema, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const activitySchema = pgSchema("ntizo_activity");

/**
 * One thing a person did.
 *
 * Keyed by the actor, never by the thing acted on: this table answers "what
 * did I do", and the inbox answers "what happened to me". Those are different
 * questions and an event answers at most one of them per person — an admin
 * approving a provider writes activity for the admin and a notification for
 * the provider.
 */
export const activity = activitySchema.table(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    /**
     * The words the sentence needs, snapshotted.
     *
     * A service name, a provider name — never a foreign key. A history entry
     * has to keep saying the same thing after the service is renamed or
     * deleted, and a row that resolved its name on read would rewrite the
     * past every time somebody edited it. The notifications phase shipped a
     * team invitation that snapshotted a uuid instead of a name and the email
     * arrived saying nothing; this is that lesson as a column comment.
     */
    payload: jsonb("payload").notNull(),
    /**
     * From the event, not from the insert.
     *
     * A handler that runs late still sorts where it belongs. Using the insert
     * time would put a delayed row at the top of somebody's history.
     */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The only query this table serves: one person's history, newest first.
    // `id` is in the index because the cursor pages on (occurred_at, id) and
    // two events can share a millisecond. `.desc()` on both trailing columns
    // typechecks fine against the drizzle-orm version installed here
    // (0.36.4) — verified against node_modules/drizzle-orm/pg-core/columns
    // /common.d.ts, where ExtraConfigColumn#desc() returns a column that
    // still satisfies IndexBuilderOn#on()'s element type — and against the
    // notification schema next door, which already ships a single `.desc()`
    // in an index. Kept as written in the brief.
    index("idx_activity_actor_occurred").on(t.actorUserId, t.occurredAt.desc(), t.id.desc()),
  ],
);

export type ActivityRow = typeof activity.$inferSelect;
export type NewActivityRow = typeof activity.$inferInsert;
