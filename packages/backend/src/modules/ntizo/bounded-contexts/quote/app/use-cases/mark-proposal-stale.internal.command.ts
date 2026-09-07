import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteProposalStale } from "../../domain/events";
import { QuoteNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";

const DEFAULT_RESPONSE_HOURS = 48;

/**
 * The acceptance lost the slot: put the quote back in front of the provider.
 *
 * **Its own transaction, after the acceptance's rolled back.** The acceptance
 * failed precisely because its transaction could not commit, so anything
 * written inside it is gone; this runs afterwards, from the catch, and is the
 * only reason `AcceptQuoteCommand` catches an error at all.
 *
 * Idempotent by the same compare-and-swap every other command uses: a quote
 * that has already moved on gets nothing.
 */
export class MarkProposalStaleInternalCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly settings: PlatformSettingsReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: { quoteId: string }): Promise<void> {
    const at = new Date();
    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);
    if (quote.status !== "PROPOSED") return;

    const service = await this.services.findForQuote(quote.serviceId, quote.locale);
    const respondBy = new Date(at.getTime() + (service?.quoteForm?.responseHours ?? DEFAULT_RESPONSE_HOURS) * 3_600_000);
    const staleProposalId = quote.liveProposal?.id ?? "";

    const moved = await this.unitOfWork.atomicExecute(async () => {
      const persisted = await this.repo.save(quote.proposalStale(at, respondBy), quote.status);
      if (!persisted) return null;
      await this.outboxPort.publish(
        [
          new QuoteProposalStale({
            quoteId: input.quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            proposalId: staleProposalId,
            cause: "slot_taken",
            respondBy,
          }),
        ],
        "quote",
      );
      return persisted;
    });

    if (!moved) return;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteSlotTaken,
        audience: "provider",
        providerId: moved.providerId,
        payload: {
          quoteId: input.quoteId,
          serviceName: service?.serviceName ?? "",
          respondBy: respondBy.toISOString(),
        },
      },
      input.quoteId,
    );
  }
}
