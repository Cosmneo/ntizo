import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteExpired } from "../../domain/events";
import { QuoteNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";

/**
 * One clock ran out. Which one, and therefore who is owed the news, is the
 * quote's own status: a `REQUESTED` quote expired on the provider and the
 * customer is told; a `PROPOSED` one expired on the customer and the provider
 * is told. `Quote.expire` names the cause from the same fact, so the two
 * cannot disagree.
 *
 * Idempotency belongs to the aggregate: `expire` is a no-op from any status
 * with no clock, so a quote this sweep claims twice costs an extra call and
 * never a double ending.
 */
export class SweepQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: { quoteId: string }): Promise<"expired" | "noop"> {
    const at = new Date();
    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);

    const moved = quote.expire(at);
    if (moved === quote) return "noop";

    const settled = await this.unitOfWork.atomicExecute(async () => {
      const persisted = await this.repo.save(moved, quote.status);
      if (!persisted) return null;
      await this.outboxPort.publish(
        [
          new QuoteExpired({
            quoteId: input.quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            cause: persisted.expiredCause as "provider_did_not_respond" | "proposal_lapsed",
          }),
        ],
        "quote",
      );
      return persisted;
    });

    if (!settled) return "noop";

    const service = await this.services.findForQuote(settled.serviceId, settled.locale);
    const serviceName = service?.serviceName ?? "";

    if (settled.expiredCause === "provider_did_not_respond") {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.QuoteExpired,
          audience: "user",
          userId: settled.customerId,
          payload: { quoteId: input.quoteId, serviceName, cause: settled.expiredCause },
        },
        input.quoteId,
      );
    } else {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.ProviderQuoteExpired,
          audience: "provider",
          providerId: settled.providerId,
          payload: { quoteId: input.quoteId, serviceName, cause: settled.expiredCause },
        },
        input.quoteId,
      );
    }

    return "expired";
  }
}
