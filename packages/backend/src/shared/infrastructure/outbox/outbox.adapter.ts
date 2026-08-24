import { BaseOutboundAdapter, InfraError } from "@cosmneo/onion-lasagna";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { OutboxPort } from "../../../modules/ntizo/shared/app/ports/outbox.port";
import { runAfterCommit } from "../database/tx-context";
import { getEventRouter } from "../events/event-router";
import { DrizzleOutboxEventRepository } from "./drizzle/outbox-event.repository";

/**
 * Transactional outbox adapter.
 *
 * `publish` is meant to be called inside a Unit of Work transaction
 * (`unitOfWork.atomicExecute`). The repository write goes through `getDb()`,
 * so the aggregate's own writes and this outbox insert commit or roll back
 * together — see `DrizzleOutboxEventRepository`.
 *
 * Still no queue publisher, and still no relay draining `outbox_event` rows.
 * What `publish` gained is an *in-process* fan-out to `EventRouter`, which is
 * a different thing and does not replace either: the row remains the durable
 * record a future relay can replay, and the router is what makes today's
 * consumers (the notification inbox) actually run. See `EventRouter`'s own
 * comment for the consequence — an isolate that dies between the commit and
 * the dispatch loses the in-process call and keeps the row.
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

  /**
   * Every publisher in the system reaches its consumers through here — 14 use
   * cases today, 13 in the Provider context and one in User — so the dispatch
   * below must not be able to fail any of them.
   *
   * Two things make that true, and both were read rather than assumed:
   *
   * 1. `EventRouter.dispatch` never rejects. Each handler is invoked inside a
   *    `try`/`catch` that logs and swallows, so every promise `Promise.all`
   *    waits on resolves. If that ever stops being true, this call site turns
   *    a failed inbox row into a failed provider approval.
   * 2. The dispatch is queued, not run, while a transaction is open —
   *    `runAfterCommit` pushes onto the transaction's callback list, and
   *    `drainAfterCommit` runs it (with its own per-callback isolation) only
   *    after the commit. A rolled-back transaction never drains, so a handler
   *    cannot act on a write that did not happen; an inbox row about something
   *    that did not happen cannot be recalled.
   *
   * It sits after the repository write on purpose: an outbox insert that threw
   * takes the transaction down with it and must not have announced anything
   * first.
   *
   * `runAfterCommit` falls back to running the callback immediately when no
   * transaction is active. No production call site publishes outside one, but
   * the fallback is what keeps a future one from silently going nowhere.
   */
  async publish(
    events: BaseDomainEvent[],
    aggregateType: string,
  ): Promise<void> {
    await this.repository.insertEvents(events, aggregateType);

    await runAfterCommit(async () => {
      await getEventRouter().dispatch(events);
    });
  }
}
