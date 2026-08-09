import { BaseOutboundAdapter, InfraError } from "@cosmneo/onion-lasagna";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { OutboxPort } from "../../../modules/ntizo/shared/app/ports/outbox.port";
import { DrizzleOutboxEventRepository } from "./drizzle/outbox-event.repository";

/**
 * Transactional outbox adapter.
 *
 * `publish` is meant to be called inside a Unit of Work transaction
 * (`unitOfWork.atomicExecute`). The repository write goes through `getDb()`,
 * so the aggregate's own writes and this outbox insert commit or roll back
 * together — see `DrizzleOutboxEventRepository`.
 *
 * No queue publisher in this slice: nothing consumes `outbox_event` rows yet
 * (no relay, no queue) — that is deliberate for Phase 3A Task 6. A future
 * phase adds a `QueuePublisherPort` and drains pending rows.
 */
export class OutboxAdapter extends BaseOutboundAdapter implements OutboxPort {
  constructor(private readonly repository: DrizzleOutboxEventRepository) {
    super();
  }

  /**
   * Pass-through error boundary: the inner repository already raises curated
   * `DbError`s. Without this override, `BaseOutboundAdapter`'s default
   * `createInfraError` would re-wrap that `DbError` into a generic
   * `InfraError("Outbound adapter error in publish")`, burying the precise
   * classification one cause-level down. An error already an `instanceof
   * InfraError` is returned untouched; only a genuinely unknown failure gets
   * wrapped once, with its `cause` preserved.
   */
  protected override createInfraError(
    error: unknown,
    methodName: string,
  ): InfraError {
    if (error instanceof InfraError) return error;
    return new InfraError({
      message: `Outbound adapter error in ${methodName}`,
      cause: error,
    });
  }

  async publish(
    events: BaseDomainEvent[],
    aggregateType: string,
  ): Promise<void> {
    await this.repository.insertEvents(events, aggregateType);
  }
}
