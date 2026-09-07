import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteRejected } from "../../domain/events";
import { QuoteNotFoundError, QuoteNotYoursError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { closeQuote } from "./close-quote";
import type { AttachmentDescriptor } from "./resolve-quote-attachments";

export interface RejectQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  /** One of `QUOTE_CUSTOMER_REJECT_REASONS`; the provider's screen renders it in their language. */
  reason: string;
  note?: string | null;
  attachments?: AttachmentDescriptor[];
}

/**
 * The customer refuses a priced proposal. Only from `PROPOSED` — there is
 * nothing to refuse before one exists; a request with no proposal yet is
 * `withdraw`n instead.
 *
 * No member reader here: the only question is whether the caller is the
 * quote's own customer, answered directly against `quote.customerId`.
 */
export class RejectQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: RejectQuoteInput): Promise<{ quoteId: string } | null> {
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
        transition: (q, note) => q.reject(at, input.requesterUserId, input.reason, note),
        event: (persisted, quoteId) =>
          new QuoteRejected({
            quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            reason: input.reason,
          }),
      },
    );

    if (!moved) return null;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteDeclined,
        audience: "provider",
        providerId: moved.providerId,
        payload: { quoteId: input.quoteId, reason: input.reason, note: moved.closedNote },
      },
      input.quoteId,
    );

    return { quoteId: input.quoteId };
  }
}
