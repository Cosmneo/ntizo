import { describe, expect, it } from "bun:test";
import { BaseDomainEvent, DbError, InfraError } from "@cosmneo/onion-lasagna";
import { OutboxAdapter } from "../outbox.adapter";
import type { DrizzleOutboxEventRepository } from "../drizzle/outbox-event.repository";

class TestEvent extends BaseDomainEvent<{ providerId: string }> {
  constructor(aggregateId: string) {
    super("test.event", aggregateId, { providerId: aggregateId });
  }
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
