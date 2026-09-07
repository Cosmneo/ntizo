import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { hasContact } from "@ntizo/shared/text";
import type { Quote } from "../../domain/aggregates/quote.aggregate";
import { QuoteProposed } from "../../domain/events";
import {
  NotProviderMemberError,
  QuoteContainsContactError,
  QuoteMemberCannotPerformError,
  QuoteNotFoundError,
  QuoteServiceNotQuotableError,
  QuoteSlotOverlapError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member.reader.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { SlotOverlapReaderPort } from "../ports/outbound/slot-overlap.reader.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { resolveQuoteAttachments, type AttachmentDescriptor } from "./resolve-quote-attachments";

export interface ProposeQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  priceMinor: number;
  startsAt: Date;
  durationMinutes: number;
  providerMemberId: string;
  note?: string | null;
  attachments?: AttachmentDescriptor[];
}

/**
 * A validity that outlived the time it offers would be a countdown on a slot
 * that has already passed — the same argument `cappedToSlotStart` makes for
 * the booking's three clocks.
 */
function cappedToStart(validUntil: Date, startsAt: Date): Date {
  return validUntil.getTime() > startsAt.getTime() ? startsAt : validUntil;
}

/**
 * The provider answers with a price, a date, a duration and a member — a
 * complete agreement, so the booking it may become is indistinguishable from
 * a priced one.
 *
 * **The proposal does not hold the slot.** Holding it would block the member's
 * calendar for the whole validity, on a table this context does not own. What
 * it does instead is refuse a start that already overlaps a slot-holding
 * booking, so a provider cannot propose a time they have sold; the exclusion
 * constraint arbitrates for real at acceptance, and `MarkProposalStaleInternalCommand`
 * handles the loser.
 *
 * **Authorisation is checked before anything is written**, and the caller's
 * membership is the only thing that decides it: `providerMemberId` names who
 * does the work, which may be a colleague.
 */
export class ProposeQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly overlap: SlotOverlapReaderPort,
    private readonly settings: PlatformSettingsReaderPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: ProposeQuoteInput): Promise<{ quoteId: string; validUntil: string } | null> {
    const at = new Date();

    const note = (input.note ?? "").trim();
    if (note.length > 0 && hasContact(note)) throw new QuoteContainsContactError();

    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);

    if (!(await this.members.isMember(quote.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const service = await this.services.findForQuote(quote.serviceId, quote.locale);
    if (!service) throw new QuoteServiceNotQuotableError("not_found");
    if (!service.memberIds.includes(input.providerMemberId)) {
      throw new QuoteMemberCannotPerformError(input.providerMemberId);
    }

    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    if (await this.overlap.overlaps({ providerMemberId: input.providerMemberId, startsAt: input.startsAt, endsAt })) {
      throw new QuoteSlotOverlapError();
    }

    // LIVE on both: an administrator's change reaches the very next proposal.
    const [validityHours, minPriceMinor] = await Promise.all([
      this.settings.findQuoteProposalValidityHours(),
      this.settings.findMinServicePriceMinor(),
    ]);
    const validUntil = cappedToStart(new Date(at.getTime() + validityHours * 3_600_000), input.startsAt);

    const resolved = await resolveQuoteAttachments(this.storage, input.requesterUserId, input.attachments ?? []);

    const wasProposed = quote.liveProposal !== null;
    const moved = quote.propose({
      priceMinor: input.priceMinor,
      currency: "MZN",
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      providerMemberId: input.providerMemberId,
      note,
      validUntil,
      createdByUserId: input.requesterUserId,
      at,
      minPriceMinor,
    });

    const saved = await this.unitOfWork.atomicExecute(async (): Promise<Quote | null> => {
      const persisted = await this.repo.save(moved, quote.status);
      if (!persisted) return null;

      const proposalId = persisted.liveProposal?.id as string;
      await this.attachments.insertMany(
        resolved.map((file) => ({ quoteId: input.quoteId, proposalId, step: "proposal" as const, ...file })),
      );

      await this.outboxPort.publish(
        [
          new QuoteProposed({
            quoteId: input.quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            proposalId,
            priceMinor: input.priceMinor,
            currency: "MZN",
            startsAt: input.startsAt,
            validUntil,
            revision: wasProposed,
          }),
        ],
        "quote",
      );

      return persisted;
    });

    if (!saved) return null;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.QuoteReceived,
        audience: "user",
        userId: saved.customerId,
        payload: {
          quoteId: input.quoteId,
          serviceName: service.serviceName,
          priceMinor: input.priceMinor,
          currency: "MZN",
          startsAt: input.startsAt.toISOString(),
          validUntil: validUntil.toISOString(),
          revision: wasProposed,
        },
      },
      input.quoteId,
    );

    return { quoteId: input.quoteId, validUntil: validUntil.toISOString() };
  }
}
