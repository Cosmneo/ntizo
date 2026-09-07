import { DrizzleQuoteRepository } from "../infrastructure/repositories/drizzle/quote.repository";
import { DrizzleQuoteAttachmentRepository } from "../infrastructure/repositories/drizzle/quote-attachment.repository";
import { DrizzleQuoteServiceReader } from "../infrastructure/repositories/drizzle/quote-service.reader";
import { DrizzleQuoteProviderMemberReader } from "../infrastructure/repositories/drizzle/provider-member.reader";
import { DrizzleQuoteCustomerPhoneReader } from "../infrastructure/repositories/drizzle/customer-phone.reader";
import { DrizzleQuotePlatformSettingsReader } from "../infrastructure/repositories/drizzle/platform-settings.reader";
import { DrizzleSlotOverlapReader } from "../infrastructure/repositories/drizzle/slot-overlap.reader";
import { RequestQuoteCommand } from "../app/use-cases/request-quote.command";
import { ProposeQuoteCommand } from "../app/use-cases/propose-quote.command";
import { DeclineQuoteCommand } from "../app/use-cases/decline-quote.command";
import { RejectQuoteCommand } from "../app/use-cases/reject-quote.command";
import { WithdrawQuoteCommand } from "../app/use-cases/withdraw-quote.command";
import { AcceptQuoteCommand } from "../app/use-cases/accept-quote.command";
import { MarkProposalStaleInternalCommand } from "../app/use-cases/mark-proposal-stale.internal.command";
import { SweepQuoteCommand } from "../app/use-cases/sweep-quote.command";
import { SweepDueQuotesInternalCommand } from "../app/use-cases/sweep-due-quotes.internal.command";
import type { AttachmentStoragePort } from "../app/ports/outbound/attachment-storage.port";
import type { BookingOpenerPort } from "../app/ports/outbound/booking-opener.port";
import type { StartThreadPort } from "../app/ports/outbound/start-thread.port";
import type { RaiseNotificationInternalPort } from "../app/ports/outbound/raise-notification.port";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

/**
 * What this context needs from the two neighbours it reaches into, and the
 * one it reaches out to.
 *
 * `raiseNotification` is required for the same reason it is required on
 * every other bounded context's bootstrap deps (see Booking's own
 * `BookingBootstrapDeps` doc comment): an optional dependency would let a
 * composition root build a quote context whose commands silently tell
 * nobody anything.
 */
export interface QuoteBootstrapDeps {
  /** The notification context's own raise command, injected at the composition root. */
  raiseNotification: RaiseNotificationInternalPort;
  /** The booking context's `CreateBookingFromQuoteCommand`, behind this context's port. */
  openBooking: BookingOpenerPort;
  /** The communication context's idempotent `StartThreadCommand`. */
  startThread: StartThreadPort;
  attachmentStorage: AttachmentStoragePort;
}

/**
 * Constructs every use case this bounded context has built so far.
 *
 * `sweepQuote` and `markProposalStale` are hoisted above the returned object
 * rather than built inline: each has two callers. `sweepQuote` is driven
 * from `internal.sweepDue`, once per due quote; `markProposalStale` is
 * driven both directly (`internal.markProposalStale`, the same cron-facing
 * shape) and from inside `acceptQuote`, on the one path where accepting a
 * lapsed proposal has to put the quote back in front of the provider rather
 * than open a booking. Two instances of either would be two copies of the
 * same compare-and-swap and the same announcements wired to the same
 * repository.
 */
export function bootstrapQuote(deps: QuoteBootstrapDeps) {
  const quoteRepository = new DrizzleQuoteRepository();
  const attachmentRepository = new DrizzleQuoteAttachmentRepository();
  const serviceReader = new DrizzleQuoteServiceReader();
  const memberReader = new DrizzleQuoteProviderMemberReader();
  const phoneReader = new DrizzleQuoteCustomerPhoneReader();
  const settingsReader = new DrizzleQuotePlatformSettingsReader();
  const overlapReader = new DrizzleSlotOverlapReader();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  // Hoisted: two callers each.
  const markProposalStale = new MarkProposalStaleInternalCommand(
    quoteRepository,
    serviceReader,
    settingsReader,
    unitOfWork,
    outboxPort,
    deps.raiseNotification,
  );
  const sweepQuote = new SweepQuoteCommand(
    quoteRepository,
    serviceReader,
    unitOfWork,
    outboxPort,
    deps.raiseNotification,
  );

  return {
    adapters: {
      quoteRepository,
      attachmentRepository,
      serviceReader,
      memberReader,
      phoneReader,
      settingsReader,
      overlapReader,
      unitOfWork,
      outboxPort,
    },
    useCases: {
      requestQuote: new RequestQuoteCommand(
        quoteRepository,
        attachmentRepository,
        serviceReader,
        deps.startThread,
        deps.attachmentStorage,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      proposeQuote: new ProposeQuoteCommand(
        quoteRepository,
        attachmentRepository,
        memberReader,
        serviceReader,
        overlapReader,
        settingsReader,
        deps.attachmentStorage,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      declineQuote: new DeclineQuoteCommand(
        quoteRepository,
        attachmentRepository,
        memberReader,
        deps.attachmentStorage,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      rejectQuote: new RejectQuoteCommand(
        quoteRepository,
        attachmentRepository,
        deps.attachmentStorage,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      withdrawQuote: new WithdrawQuoteCommand(
        quoteRepository,
        attachmentRepository,
        deps.attachmentStorage,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      acceptQuote: new AcceptQuoteCommand(
        quoteRepository,
        serviceReader,
        phoneReader,
        deps.openBooking,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
        markProposalStale,
      ),
      internal: {
        sweepDue: new SweepDueQuotesInternalCommand(quoteRepository, sweepQuote),
        markProposalStale,
      },
    },
  };
}

export type QuoteBootstrap = ReturnType<typeof bootstrapQuote>;
