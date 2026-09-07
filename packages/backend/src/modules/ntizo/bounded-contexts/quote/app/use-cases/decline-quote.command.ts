import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteDeclined } from "../../domain/events";
import { NotProviderMemberError, QuoteNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member.reader.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { closeQuote } from "./close-quote";
import type { AttachmentDescriptor } from "./resolve-quote-attachments";

export interface DeclineQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  /** One of `QUOTE_PROVIDER_DECLINE_REASONS`; the customer's screen renders it in their language. */
  reason: string;
  note?: string | null;
  attachments?: AttachmentDescriptor[];
}

/**
 * The provider's no, from either open state: a request they will not price,
 * or a proposal they are taking back. Both land on `DECLINED`, because from
 * the customer's side they are the same news — this provider is not doing it.
 */
export class DeclineQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: DeclineQuoteInput): Promise<{ quoteId: string } | null> {
    const at = new Date();
    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);
    if (!(await this.members.isMember(quote.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const moved = await closeQuote(
      { repo: this.repo, attachments: this.attachments, storage: this.storage, unitOfWork: this.unitOfWork, outboxPort: this.outboxPort },
      {
        quote,
        actorUserId: input.requesterUserId,
        note: input.note,
        attachments: input.attachments,
        transition: (q, note) => q.decline(at, input.requesterUserId, input.reason, note),
        event: (persisted, quoteId) =>
          new QuoteDeclined({
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
        type: NotificationType.QuoteDeclined,
        audience: "user",
        userId: moved.customerId,
        payload: { quoteId: input.quoteId, reason: input.reason, note: moved.closedNote },
      },
      input.quoteId,
    );

    return { quoteId: input.quoteId };
  }
}
