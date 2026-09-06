import { afterEach, describe, expect, it } from "bun:test";
import { BaseDomainEvent, DbError, InfraError } from "@cosmneo/onion-lasagna";
import { OutboxAdapter } from "../outbox.adapter";
import {
  __resetEventRouterForTests,
  getEventRouter,
} from "../../events/event-router";
import { __runWithTransactionContextForTests } from "../../database/tx-context";
import type { DrizzleDb } from "../../database/connection";
import type { DrizzleOutboxEventRepository } from "../drizzle/outbox-event.repository";

class TestEvent extends BaseDomainEvent<{ providerId: string }> {
  constructor(aggregateId: string) {
    super("test.event", aggregateId, { providerId: aggregateId });
  }
}

// The router is a module-scoped singleton, so a handler registered by one
// test would still be registered for the next file `bun test` loads into the
// same process. Reset rather than rely on ordering.
afterEach(() => {
  __resetEventRouterForTests();
});

/** `__runWithTransactionContextForTests` only needs a handle to bind. */
const fakeDb = {} as DrizzleDb;

/** Accepts every write, so each test below is about the dispatch only. */
function recordingRepository() {
  return {
    async insertEvents() {},
    async markDispatched() {},
  } as unknown as DrizzleOutboxEventRepository;
}

describe("OutboxAdapter", () => {
  it("delegates publish to the repository with the given aggregateType", async () => {
    const calls: { events: BaseDomainEvent[]; aggregateType: string }[] = [];
    const fakeRepository = {
      async insertEvents(events: BaseDomainEvent[], aggregateType: string) {
        calls.push({ events, aggregateType });
      },
    } as unknown as DrizzleOutboxEventRepository;

    const adapter = new OutboxAdapter(fakeRepository);
    const event = new TestEvent("provider-123");

    await adapter.publish([event], "provider");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.events).toEqual([event]);
    expect(calls[0]?.aggregateType).toBe("provider");
  });

  // Audit posture kept from the reference adapter: an already-classified
  // InfraError (the repository's own DbError) must pass through untouched,
  // not get buried one cause-level down inside a generic
  // "Outbound adapter error in publish".
  it("passes an already-classified InfraError through untouched", async () => {
    const dbError = new DbError({
      message: "Failed to insert 1 outbox event(s) for aggregate type 'provider'",
      cause: new Error("connection reset"),
    });
    const failingRepository = {
      async insertEvents() {
        throw dbError;
      },
    } as unknown as DrizzleOutboxEventRepository;

    const adapter = new OutboxAdapter(failingRepository);

    await expect(
      adapter.publish([new TestEvent("provider-123")], "provider"),
    ).rejects.toBe(dbError);
  });

  it("wraps an unknown failure in a single InfraError with its cause preserved", async () => {
    const unknownError = new Error("something unrelated broke");
    const failingRepository = {
      async insertEvents() {
        throw unknownError;
      },
    } as unknown as DrizzleOutboxEventRepository;

    const adapter = new OutboxAdapter(failingRepository);

    let caught: unknown;
    try {
      await adapter.publish([new TestEvent("provider-123")], "provider");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InfraError);
    expect((caught as InfraError).cause).toBe(unknownError);
  });
});

describe("OutboxAdapter — in-process dispatch", () => {
  it("dispatches to the router when there is no transaction to wait for", async () => {
    const seen: string[] = [];
    getEventRouter().on("test.event", async (event) => void seen.push(event.eventName));

    await new OutboxAdapter(recordingRepository()).publish(
      [new TestEvent("provider-123")],
      "provider",
    );

    expect(seen).toEqual(["test.event"]);
  });

  it("holds the dispatch until the transaction commits", async () => {
    const seen: string[] = [];
    getEventRouter().on("test.event", async (event) => void seen.push(event.eventName));
    const adapter = new OutboxAdapter(recordingRepository());

    await __runWithTransactionContextForTests(fakeDb, async () => {
      await adapter.publish([new TestEvent("provider-123")], "provider");
      // Still inside the transaction: the write can still roll back, so
      // nothing may have reacted to it yet.
      expect(seen).toEqual([]);
    });

    expect(seen).toEqual(["test.event"]);
  });

  it("dispatches nothing when the transaction does not commit", async () => {
    const seen: string[] = [];
    getEventRouter().on("test.event", async (event) => void seen.push(event.eventName));
    const adapter = new OutboxAdapter(recordingRepository());

    await __runWithTransactionContextForTests(
      fakeDb,
      async () => {
        await adapter.publish([new TestEvent("provider-123")], "provider");
      },
      { commit: false },
    );

    expect(seen).toEqual([]);
  });

  it("does not dispatch when the outbox write itself failed", async () => {
    const seen: string[] = [];
    getEventRouter().on("test.event", async (event) => void seen.push(event.eventName));
    const failingRepository = {
      async insertEvents() {
        throw new Error("insert failed");
      },
    } as unknown as DrizzleOutboxEventRepository;

    await expect(
      new OutboxAdapter(failingRepository).publish([new TestEvent("p1")], "provider"),
    ).rejects.toBeInstanceOf(InfraError);

    expect(seen).toEqual([]);
  });

  it("does not fail its caller when a handler throws", async () => {
    // 14 use cases publish through this adapter. A broken notification
    // template must not turn a successful provider approval into a 500.
    getEventRouter().on("test.event", async () => {
      throw new Error("handler exploded");
    });

    await expect(
      new OutboxAdapter(recordingRepository()).publish(
        [new TestEvent("provider-123")],
        "provider",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("OutboxAdapter — what `status` means", () => {
  /**
   * The column was inserted as `pending` and never advanced by anything, so
   * it said "awaiting dispatch" about 267 rows that had already been
   * dispatched. That is worse than an unused column: the obvious reading of
   * it — drain everything pending — would have re-sent hundreds of
   * notifications to real people.
   *
   * Marking after the dispatch is what makes `pending` finally mean
   * undelivered, which is the precondition for ever building a relay on it.
   */
  it("marks an event dispatched once its handlers have run", async () => {
    const marked: string[] = [];
    const repository = {
      async insertEvents() {},
      async markDispatched(ids: string[]) {
        marked.push(...ids);
      },
    } as unknown as DrizzleOutboxEventRepository;

    const adapter = new OutboxAdapter(repository);
    const event = new TestEvent("provider-123");

    await __runWithTransactionContextForTests(fakeDb, async () => {
      await adapter.publish([event], "provider");
    });

    expect(marked).toEqual([event.eventId]);
  });

  it("leaves the row pending when the commit never happens", async () => {
    // A rolled-back transaction never drains its after-commit callbacks, so
    // nothing was announced and nothing may be marked. The insert rolled back
    // with it, but the ordering is the point: marking must be downstream of
    // the dispatch, not beside the insert.
    const marked: string[] = [];
    const repository = {
      async insertEvents() {},
      async markDispatched(ids: string[]) {
        marked.push(...ids);
      },
    } as unknown as DrizzleOutboxEventRepository;

    const adapter = new OutboxAdapter(repository);

    await __runWithTransactionContextForTests(
      fakeDb,
      async () => {
        await adapter.publish([new TestEvent("provider-123")], "provider");
      },
      { commit: false },
    );

    expect(marked).toEqual([]);
  });

  it("still reports the publish as successful when marking fails", async () => {
    // The mark is bookkeeping about something that already happened. A
    // failure to record it must not fail the provider approval that produced
    // the event — the same rule the dispatch itself follows, and the reason
    // this adapter's docblock exists.
    const repository = {
      async insertEvents() {},
      async markDispatched() {
        throw new Error("the update lost its connection");
      },
    } as unknown as DrizzleOutboxEventRepository;

    const adapter = new OutboxAdapter(repository);

    await __runWithTransactionContextForTests(fakeDb, async () => {
      await adapter.publish([new TestEvent("provider-123")], "provider");
    });
    // Reaching here without throwing is the assertion.
    expect(true).toBe(true);
  });
});
