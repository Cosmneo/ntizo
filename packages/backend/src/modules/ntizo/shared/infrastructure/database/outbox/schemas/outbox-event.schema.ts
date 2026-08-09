import {
  pgSchema,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  index,
} from "drizzle-orm/pg-core";

export const outboxSchema = pgSchema("ntizo_outbox");

// outbox_event — transactional outbox for domain events raised by aggregates.
// One row per event, written in the same DB transaction as the aggregate
// change it describes; a separate dispatcher (Task 6+) later reads pending
// rows and publishes them.
//
// aggregateId is `text`, not `uuid`: BaseDomainEvent#aggregateId is typed
// `string`, and not every aggregate id is UUID-shaped. `ntizo_provider.provider.id`
// is a real `uuid`, but `ntizo_user.user.id` (and `ntizo_user.profile.userId`)
// is `text` — better-auth generates ids like "xV0gueU3hsRPLPVt6pv5G3JYZLuetPe5",
// not a UUID string. A `uuid` column would reject those at insert time.
export const outboxEvent = outboxSchema.table(
  "outbox_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").notNull(),
    metadata: jsonb("metadata"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_outbox_event_status").on(t.status)],
);

export type OutboxEventRow = typeof outboxEvent.$inferSelect;
export type NewOutboxEventRow = typeof outboxEvent.$inferInsert;
