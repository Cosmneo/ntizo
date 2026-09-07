import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Quote, QuoteAddress } from "../../domain/aggregates/quote.aggregate";
import { QuoteAccepted } from "../../domain/events";
import {
  QuoteAddressRequiredError,
  QuoteConcurrentlyChangedError,
  QuoteMemberCannotPerformError,
  QuoteNoCustomerPhoneError,
  QuoteNoLiveProposalError,
  QuoteNotFoundError,
  QuoteNotYoursError,
  QuoteProposalLapsedError,
  QuoteServiceNotQuotableError,
  QuoteSlotTakenError,
  QuoteTransitionError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { CustomerPhoneReaderPort } from "../ports/outbound/customer-phone.reader.port";
import type { BookingOpenerPort } from "../ports/outbound/booking-opener.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import type { MarkProposalStaleInternalCommand } from "./mark-proposal-stale.internal.command";

export interface AcceptQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  /** Supplied only when the request carried no address. */
  address?: QuoteAddress | null;
}

/**
 * Accepting is paying: this is the one act, and there is deliberately no
 * moment where the deal is closed and the money undecided.
 *
 * **The booking is opened first, inside the transaction, and the quote is
 * closed onto its id.** The order matters: the id has to exist before the
 * quote can name it, and both writes are in one transaction because a quote
 * marked `ACCEPTED` beside no booking is a state nobody could explain.
 *
 * **The phone is checked here, not by the charge.** A customer with no
 * number would have the sweep spend all three attempts against nothing and
 * the payment window then cancel a booking the provider had already blocked
 * their Saturday for. The web writes the number through the User context
 * before calling this, exactly as checkout's step 3 does.
 *
 * **`QuoteSlotTakenError` is the one error this command handles rather than
 * raises.** The transaction is gone by the time it surfaces, so the recovery
 * runs in a second one and then the original error is re-thrown for the
 * customer's screen to explain.
 *
 * **The status, live-proposal and lapsed checks run before the booking is
 * opened, not inside `quote.accept()` after it.** `quote.accept()` re-checks
 * all three anyway, but by then the calendar would already have been asked
 * to hold a slot for a quote that was never going to close — a refusal must
 * write nothing, and calling the booking opener is a write.
 */
export class AcceptQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly phones: CustomerPhoneReaderPort,
    private readonly bookings: BookingOpenerPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly markStale: MarkProposalStaleInternalCommand,
  ) {}

  async execute(input: AcceptQuoteInput): Promise<{ bookingId: string; payBy: string }> {
    const at = new Date();

    const loaded = await this.repo.findById(input.quoteId);
    if (!loaded) throw new QuoteNotFoundError(input.quoteId);
    if (loaded.customerId !== input.requesterUserId) throw new QuoteNotYoursError();
    // Mirrors the order `Quote.accept()` itself checks in: status, then live
    // proposal, then lapsed, then address — done here, ahead of the booking
    // opener, so a refusal never reaches it.
    if (loaded.status !== "PROPOSED") throw new QuoteTransitionError(loaded.status, "ACCEPTED");

    const quote = input.address ? loaded.withAddress(input.address) : loaded;

    const proposal = quote.liveProposal;
    if (!proposal) throw new QuoteNoLiveProposalError();
    if (proposal.validUntil.getTime() <= at.getTime()) throw new QuoteProposalLapsedError(proposal.validUntil);
    if (!quote.hasCompleteAddress()) throw new QuoteAddressRequiredError();

    const phone = await this.phones.findPhoneNumber(quote.customerId);
    if (phone === null || phone.trim() === "") throw new QuoteNoCustomerPhoneError();

    // Re-checked at the last moment: a service unpublished, a provider
    // suspended or a member taken off the service between the proposal and
    // the acceptance must not become a booking.
    const service = await this.services.findForQuote(quote.serviceId, quote.locale);
    if (!service) throw new QuoteServiceNotQuotableError("not_found");
    if (service.serviceStatus !== "published") throw new QuoteServiceNotQuotableError("not_published");
    if (service.providerStatus !== "active") throw new QuoteServiceNotQuotableError("provider_not_active");
    if (!service.memberIds.includes(proposal.providerMemberId)) {
      throw new QuoteMemberCannotPerformError(proposal.providerMemberId);
    }

    let outcome: { moved: Quote; bookingId: string; payBy: Date };
    try {
      outcome = await this.unitOfWork.atomicExecute(async () => {
        const opened = await this.bookings.openFromQuote({
          quoteId: input.quoteId,
          customerId: quote.customerId,
          providerId: quote.providerId,
          serviceId: quote.serviceId,
          providerMemberId: proposal.providerMemberId,
          startsAt: proposal.startsAt,
          durationMinutes: proposal.durationMinutes,
          priceMinor: proposal.priceMinor,
          currency: proposal.currency,
          serviceName: service.serviceName,
          address: {
            label: quote.addressLabel as string,
            line: quote.addressLine as string,
            city: quote.addressCity as string,
            district: quote.addressDistrict,
            directions: quote.addressDirections,
            lat: quote.addressLat,
            lng: quote.addressLng,
          },
          description: quote.description,
          acceptedByUserId: input.requesterUserId,
        });

        // A lost compare-and-swap is not a taken slot. The genuine slot
        // conflict never arrives here: it comes out of the booking opener as
        // `SlotAlreadyTakenError`, translated to `QuoteSlotTakenError` by
        // `bookingOpenerOver`. Reaching this line means the quote itself
        // moved — revised, declined, withdrawn, expired — between the load
        // and the swap, and the only truthful answer is to say so and let
        // the caller reload. Saying "taken slot" here would also run the
        // recovery below, superseding whatever proposal is live now with
        // `slot_taken` on the strength of a race the calendar had no part in.
        const persisted = await this.repo.save(quote.accept(at, opened.bookingId), loaded.status);
        if (!persisted) throw new QuoteConcurrentlyChangedError();

        await this.outboxPort.publish(
          [
            new QuoteAccepted({
              quoteId: input.quoteId,
              customerId: persisted.customerId,
              providerId: persisted.providerId,
              serviceId: persisted.serviceId,
              bookingId: opened.bookingId,
              priceMinor: proposal.priceMinor,
              currency: proposal.currency,
            }),
          ],
          "quote",
        );

        return { moved: persisted, bookingId: opened.bookingId, payBy: opened.payBy };
      });
    } catch (error) {
      if (error instanceof QuoteSlotTakenError) {
        // Its own transaction: this one is gone. A failure to recover must not
        // replace the error the customer's screen knows how to explain.
        try {
          await this.markStale.execute({ quoteId: input.quoteId });
        } catch (recoveryError) {
          console.error(`[quote] could not put ${input.quoteId} back to the provider`, recoveryError);
        }
      }
      throw error;
    }

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.QuoteAccepted,
        audience: "user",
        userId: outcome.moved.customerId,
        payload: {
          quoteId: input.quoteId,
          bookingId: outcome.bookingId,
          serviceName: service.serviceName,
          priceMinor: proposal.priceMinor,
          currency: proposal.currency,
          payBy: outcome.payBy.toISOString(),
        },
      },
      input.quoteId,
    );

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteAccepted,
        audience: "provider",
        providerId: outcome.moved.providerId,
        payload: {
          quoteId: input.quoteId,
          bookingId: outcome.bookingId,
          serviceName: service.serviceName,
          priceMinor: proposal.priceMinor,
          currency: proposal.currency,
          startsAt: proposal.startsAt.toISOString(),
        },
      },
      input.quoteId,
    );

    return { bookingId: outcome.bookingId, payBy: outcome.payBy.toISOString() };
  }
}
