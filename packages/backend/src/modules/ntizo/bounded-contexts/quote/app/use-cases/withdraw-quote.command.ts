import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteWithdrawn } from "../../domain/events";
import { QuoteNotFoundError, QuoteNotYoursError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { closeQuote } from "./close-quote";
import type { AttachmentDescriptor } from "./resolve-quote-attachments";

export interface WithdrawQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  note?: string | null;
  attachments?: AttachmentDescriptor[];
}

/**
 * The customer takes the request back before it is answered. Only from
 * `REQUESTED` — once a proposal exists there is a price to refuse, and the
 * customer `reject`s instead.
 *
 * No `reason` argument: there is only one reason a customer withdraws a
 * request, and the aggregate records it as the fixed token `"withdrawn"`.
 * No member reader either, for the same reason `RejectQuoteCommand` has
 * none — the guard is the caller being the quote's own customer.
 */
export class WithdrawQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: WithdrawQuoteInput): Promise<{ quoteId: string } | null> {
    const at = new Date();
    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);
    if (quote.customerId !== input.requesterUserId) throw new QuoteNotYoursError();

    const moved = await closeQuote(
      { repo: this.repo, attachments: this.attachments, storage: this.storage, unitOfWork: this.unitOfWork, outboxPort: this.outboxPort },
      {
        quote,
        actorUserId: input.requesterUserId,
        note: input.note,
        attachments: input.attachments,
        transition: (q, note) => q.withdraw(at, input.requesterUserId, note),
        event: (persisted, quoteId) =>
          new QuoteWithdrawn({
            quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
          }),
      },
    );

    if (!moved) return null;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteWithdrawn,
        audience: "provider",
        providerId: moved.providerId,
        payload: { quoteId: input.quoteId },
      },
      input.quoteId,
    );

    return { quoteId: input.quoteId };
  }
}
