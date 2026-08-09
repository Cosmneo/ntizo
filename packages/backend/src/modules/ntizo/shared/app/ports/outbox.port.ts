import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * Outbound port for publishing domain events through the transactional
 * outbox.
 *
 * A use case calls `publish` from *inside* the same
 * `unitOfWork.atomicExecute` block that performs its aggregate writes. The
 * `OutboxAdapter` (`shared/infrastructure/outbox`) persists the events
 * through `getDb()`, which resolves to that same active transaction — so the
 * outbox row(s) and the aggregate writes commit or roll back together. An
 * event describing a write that did not happen is worse than no event.
 *
 * No queue or relay consumes `outbox_event` rows yet (Phase 3A, Task 6 is
 * deliberately outbox-only); a later phase adds that fan-out.
 */
export interface OutboxPort {
  publish(events: BaseDomainEvent[], aggregateType: string): Promise<void>;
}
