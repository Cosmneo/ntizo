import { describe, expect, it } from "bun:test";
import { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { __runWithTransactionContextForTests } from "../../../database/tx-context";
import { DrizzleOutboxEventRepository } from "../outbox-event.repository";
import { outboxEvent } from "../../../../../modules/ntizo/shared/infrastructure/database/outbox/schemas/outbox-event.schema";

class TestEvent extends BaseDomainEvent<{ providerId: string }> {
  constructor(aggregateId: string) {
    super("test.event", aggregateId, { providerId: aggregateId });
  }
}

/**
 * Minimal fake standing in for the drizzle handle `getDb()` resolves to.
 * Records exactly what `insert(table).values(rows)` was called with, so the
 * test can assert on the shape of the row without touching Postgres.
 */
function createFakeDb() {
  const calls: { table: unknown; rows: unknown[] }[] = [];
  const fakeDb = {
    insert(table: unknown) {
      return {
        values(rows: unknown[]) {
          calls.push({ table, rows });
          return Promise.resolve();
        },
      };
    },
  };
  return { fakeDb, calls };
}

describe("DrizzleOutboxEventRepository", () => {
  it("inserts through the ambient transaction handle (getDb()), not a connection of its own", async () => {
    // The whole transactional-outbox property depends on this: if a future
    // change swapped getDb() for opening a fresh connection, this repository
    // would stop joining the caller's transaction and the row would survive
    // a rollback. Proving `fakeDb.insert` was called — the ONLY db handle
    // bound in this test's ALS scope — is a permanent, DB-free regression
    // guard for that. (The real-Postgres version of this property is proven
    // separately against the live dev database — see Task 6's report.)
    const { fakeDb, calls } = createFakeDb();
    const repo = new DrizzleOutboxEventRepository();
    const event = new TestEvent("provider-123");

    await __runWithTransactionContextForTests(fakeDb as never, async () => {
      await repo.insertEvents([event], "provider");
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe(outboxEvent);
  });

  it("maps event fields to the outbox row shape", async () => {
    const { fakeDb, calls } = createFakeDb();
    const repo = new DrizzleOutboxEventRepository();
    const event = new TestEvent("provider-123");

    await __runWithTransactionContextForTests(fakeDb as never, async () => {
      await repo.insertEvents([event], "provider");
    });

    const row = calls[0]?.rows[0] as Record<string, unknown>;
    expect(row.id).toBe(event.eventId);
    expect(row.eventType).toBe("test.event");
    expect(row.aggregateType).toBe("provider");
    expect(row.aggregateId).toBe("provider-123");
    expect(row.payload).toEqual({ providerId: "provider-123" });
    expect(row.status).toBe("pending");
    expect(row.createdAt).toEqual(event.occurredOn);
  });

  it("does nothing for an empty event list", async () => {
    const { fakeDb, calls } = createFakeDb();
    const repo = new DrizzleOutboxEventRepository();

    await __runWithTransactionContextForTests(fakeDb as never, async () => {
      await repo.insertEvents([], "provider");
    });

    expect(calls).toHaveLength(0);
  });

  it("batches every event from one call into a single insert", async () => {
    const { fakeDb, calls } = createFakeDb();
    const repo = new DrizzleOutboxEventRepository();

    await __runWithTransactionContextForTests(fakeDb as never, async () => {
      await repo.insertEvents(
        [new TestEvent("provider-1"), new TestEvent("provider-2")],
        "provider",
      );
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.rows).toHaveLength(2);
  });
});
