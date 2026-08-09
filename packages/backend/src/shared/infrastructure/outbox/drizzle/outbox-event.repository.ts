import { DbError, wrapErrorAsync } from "@cosmneo/onion-lasagna";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { getDb } from "../../../../modules/better-auth/infrastructure/client/drizzle";
import {
  outboxEvent,
  type NewOutboxEventRow,
} from "../../../../modules/ntizo/shared/infrastructure/database/outbox/schemas/outbox-event.schema";

// Matches the `status` column's default in the outbox schema (Task 5). No
// enum was added to the schema itself (out of this task's scope), so the
// literal is kept local to the one place that writes it.
const OUTBOX_STATUS_PENDING = "pending";

/**
 * Drizzle-backed outbox repository.
 *
 * Writes through `getDb()`, which resolves to the transaction bound by an
 * enclosing `ensureTransaction`/`runInTransaction` call when one is active —
 * the same handle every other repository's writes go through — instead of
 * opening a connection of its own. That is the entire mechanism behind the
 * transactional outbox: when this insert runs inside a use case's
 * `unitOfWork.atomicExecute`, it joins the same Postgres transaction as the
 * aggregate writes, so both commit or both roll back. See
 * `shared/infrastructure/database/tx-context.ts`.
 */
export class DrizzleOutboxEventRepository {
  async insertEvents(
    events: BaseDomainEvent[],
    aggregateType: string,
  ): Promise<void> {
    if (events.length === 0) return;

    const db = getDb();

    const rows: NewOutboxEventRow[] = events.map((event) => ({
      id: event.eventId,
      eventType: event.eventName,
      aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Record<string, unknown>,
      metadata: { occurredOn: event.occurredOn.toISOString() },
      status: OUTBOX_STATUS_PENDING,
      createdAt: event.occurredOn,
    }));

    await wrapErrorAsync(
      () => db.insert(outboxEvent).values(rows),
      (cause) =>
        new DbError({
          message: `Failed to insert ${rows.length} outbox event(s) for aggregate type '${aggregateType}'`,
          cause,
        }),
    );
  }
}
